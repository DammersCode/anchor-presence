#!/usr/bin/env node
// Measures anchor geometry in a running app with Playwright and scores cursor-jump risk per view pair.
// Usage: node measure.mjs [--config .anchor-audit/audit.config.json] [--out .anchor-audit/anchor-audit.json] [--fail-above <score>] [--check]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULTS, THRESHOLDS, WEIGHTS, scoreViews } from "./score.mjs";

const DEFAULT_HEIGHT = 900;
const GAP_SAMPLES = 400;
const SUMMARY_ROWS = 10;
const INSTALL_HINT =
  "Playwright is missing. Install it in the app, then the browser:\n" +
  "  npm install -D playwright   (pnpm add -D playwright | yarn add -D playwright | bun add -d playwright)\n" +
  "  npx playwright install chromium";

const USAGE =
  "Usage: node measure.mjs [--config .anchor-audit/audit.config.json] [--out .anchor-audit/anchor-audit.json]\n" +
  "                        [--fail-above <score>] [--check]";

function parseCli() {
  return parseArgs({
    options: {
      config: { type: "string", default: ".anchor-audit/audit.config.json" },
      out: { type: "string", default: ".anchor-audit/anchor-audit.json" },
      "fail-above": { type: "string" },
      check: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  }).values;
}

async function readJson(file) {
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: invalid JSON: ${firstLine(error)}`, { cause: error });
  }
}

// Resolve from the app first: the skill folder usually has no node_modules of its own.
async function loadChromium() {
  const bases = [pathToFileURL(path.join(process.cwd(), "package.json")).href, import.meta.url];
  for (const base of bases) {
    const require = createRequire(base);
    for (const name of ["playwright", "@playwright/test"]) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- candidates are tried in order; the first hit wins
        const module = await import(pathToFileURL(require.resolve(name)).href);
        const chromium = module.chromium ?? module.default?.chromium;
        if (chromium !== undefined) return chromium;
      } catch {
        // try the next candidate
      }
    }
  }
  return null;
}

function firstLine(error) {
  return error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
}

function normalizeViewport(viewport) {
  if (typeof viewport === "number") return { name: `${viewport}px`, width: viewport, height: DEFAULT_HEIGHT };
  return { name: `${viewport.width}px`, height: DEFAULT_HEIGHT, ...viewport };
}

/** Expands routes x viewports x states, plus explicit views, into one flat list of views. */
function expandViews(config) {
  const views = [];
  const states = Object.entries(config.states ?? { default: [] });
  for (const route of config.routes ?? []) {
    for (const viewport of (config.viewports ?? []).map((v) => normalizeViewport(v))) {
      for (const [state, steps] of states) {
        views.push({
          page: route,
          name: state === "default" ? viewport.name : `${viewport.name} ${state}`,
          url: route,
          width: viewport.width,
          height: viewport.height,
          steps,
        });
      }
    }
  }
  for (const view of config.views ?? []) {
    views.push({ height: DEFAULT_HEIGHT, steps: [], page: view.url, name: view.url, ...view });
  }
  return views;
}

function runStep(page, step) {
  if (step.click !== undefined) return page.click(step.click);
  if (step.setAttribute !== undefined) {
    const { selector, name, value } = step.setAttribute;
    return page
      .locator(selector)
      .first()
      .evaluate((element, [attr, next]) => element.setAttribute(attr, next), [name, value]);
  }
  if (step.press !== undefined) {
    return step.selector === undefined
      ? page.keyboard.press(step.press)
      : page.press(step.selector, step.press);
  }
  if (typeof step.wait === "number") return page.waitForTimeout(step.wait);
  if (typeof step.wait === "string") return page.waitForSelector(step.wait);
  throw new Error(`Unknown step ${JSON.stringify(step)}`);
}

/** Runs inside the page: anchor rects, chains, and gap coverage. Must stay self-contained. */
function collectInPage({ attribute, samples }) {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Playwright serializes this function alone.
  const parentOf = (element) =>
    element.parentElement ?? (element.parentNode instanceof ShadowRoot ? element.parentNode.host : null);
  /** @param {Element} element */
  const anchorId = (element) => {
    const id = element.getAttribute(attribute);
    return id === "" ? null : id;
  };

  /** @type {Element[]} */
  const all = [];
  const walk = (root) => {
    for (const element of root.querySelectorAll("*")) {
      if (anchorId(element) !== null) all.push(element);
      if (element.shadowRoot !== null) walk(element.shadowRoot);
    }
  };
  walk(document);

  const selectorOf = (element) => {
    const parts = [];
    let current = element;
    while (current !== null && current !== document.body && parts.length < 5) {
      if (current.id !== "") {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const { tagName } = current;
      const tag = tagName.toLowerCase();
      const parent = parentOf(current);
      const siblings = parent === null ? [] : [...parent.children].filter((c) => c.tagName === tagName);
      parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag);
      current = parent;
    }
    return parts.join(" > ");
  };

  const ancestorsOf = (element) => {
    const ids = [];
    for (let current = parentOf(element); current !== null; current = parentOf(current)) {
      const id = anchorId(current);
      if (id !== null) ids.push(id);
    }
    return ids;
  };

  // The part a pointer can reach: clipped by every scrolling or clipping ancestor below <body>.
  const visibleRectOf = (element, rect) => {
    let [left, top, right, bottom] = [rect.left, rect.top, rect.right, rect.bottom];
    let current = parentOf(element);
    while (current !== null && current !== document.body) {
      const style = getComputedStyle(current);
      const clip = current.getBoundingClientRect();
      if (style.overflowX !== "visible") {
        [left, right] = [Math.max(left, clip.left), Math.min(right, clip.right)];
      }
      if (style.overflowY !== "visible") {
        [top, bottom] = [Math.max(top, clip.top), Math.min(bottom, clip.bottom)];
      }
      current = parentOf(current);
    }
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  const ids = all.map((element) => anchorId(element));
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const anchors = all.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      id: anchorId(element),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      visible: visibleRectOf(element, rect),
      measurable: element.isConnected && rect.width > 0 && rect.height > 0,
      ancestors: ancestorsOf(element),
      selector: selectorOf(element),
    };
  });

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const covered = (x, y) => {
    const inView = x >= 0 && y >= 0 && x < viewport.width && y < viewport.height;
    // elementFromPoint only sees the viewport; below the fold, fall back to plain box geometry.
    if (!inView) {
      return anchors.some(
        (a) =>
          a.measurable &&
          x >= a.rect.left &&
          x <= a.rect.left + a.rect.width &&
          y >= a.rect.top &&
          y <= a.rect.top + a.rect.height,
      );
    }
    for (let current = document.elementFromPoint(x, y); current !== null; current = parentOf(current)) {
      if (anchorId(current) !== null) return true;
    }
    return false;
  };

  // A container is the box around sibling anchors that share one nearest anchored ancestor (or none).
  const groups = new Map();
  for (const anchor of anchors) {
    if (!anchor.measurable || anchor.visible.width === 0 || anchor.visible.height === 0) continue;
    const key = anchor.ancestors[0] ?? null;
    groups.set(key, [...(groups.get(key) ?? []), anchor]);
  }

  const containers = [];
  for (const [parent, members] of groups) {
    if (members.length < 2) continue;
    const left = Math.min(...members.map((m) => m.visible.left));
    const top = Math.min(...members.map((m) => m.visible.top));
    const right = Math.max(...members.map((m) => m.visible.left + m.visible.width));
    const bottom = Math.max(...members.map((m) => m.visible.top + m.visible.height));
    const area = (right - left) * (bottom - top);
    if (area <= 0) continue;
    const step = Math.max(4, Math.sqrt(area / samples));
    let total = 0;
    let open = 0;
    let example = null;
    for (let y = top + step / 2; y < bottom; y += step) {
      for (let x = left + step / 2; x < right; x += step) {
        total += 1;
        if (covered(x, y)) continue;
        open += 1;
        if (example === null) {
          const hit = document.elementFromPoint(x, y);
          example = { x: Math.round(x), y: Math.round(y), selector: hit === null ? null : selectorOf(hit) };
        }
      }
    }
    containers.push({
      parent,
      members: members.map((m) => m.id).slice(0, 6),
      memberCount: members.length,
      area: Math.round(area),
      uncovered: total === 0 ? 0 : Math.round((open / total) * 100) / 100,
      example,
    });
  }

  const totalArea = containers.reduce((sum, c) => sum + c.area, 0);
  const uncovered =
    totalArea === 0 ? 0 : containers.reduce((sum, c) => sum + c.uncovered * c.area, 0) / totalArea;

  return { viewport, anchors, duplicates, gap: { uncovered: Math.round(uncovered * 100) / 100, containers } };
}

async function measureView(browser, config, view) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.goto(new URL(view.url, config.baseUrl).href, { waitUntil: config.waitUntil ?? "load" });
    await page.waitForSelector(`[${config.anchorAttribute}]`, { timeout: config.timeoutMs ?? 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(config.settleMs ?? 500);
    // oxlint-disable-next-line no-await-in-loop -- steps build on each other, so they run in order
    for (const step of view.steps) await runStep(page, step);
    if (view.steps.length > 0) await page.waitForTimeout(config.settleMs ?? 500);
    const data = await page.evaluate(collectInPage, {
      attribute: config.anchorAttribute,
      samples: GAP_SAMPLES,
    });
    data.gap.containers = data.gap.containers.map((container) => ({ view: view.name, ...container }));
    return { ...view, ...data };
  } catch (error) {
    return { ...view, error: firstLine(error) };
  } finally {
    await context.close();
  }
}

function printSummary(result, outPath) {
  const measured = result.views.filter((v) => v.error === undefined).length;
  console.log(
    `Measured ${measured}/${result.views.length} views, scored ${result.pairs.length} pairs -> ${outPath}`,
  );
  for (const view of result.views) {
    if (view.error !== undefined) console.log(`  ERROR ${view.page} ${view.name}: ${view.error}`);
    else if (view.duplicates.length > 0) {
      console.log(
        `  WARN ${view.page} ${view.name}: duplicate anchor IDs ${view.duplicates.slice(0, 5).join(", ")}`,
      );
    }
  }
  for (const pair of result.pairs.slice(0, SUMMARY_ROWS)) {
    const s = pair.sub;
    console.log(
      `  ${String(pair.total).padStart(3)} ${pair.band.padEnd(8)} ${pair.page}: ${pair.a} vs ${pair.b}` +
        `  (jump ${s.jump}, gap ${s.gap}, depth ${s.depth}, aspect ${s.aspect}, parity ${s.parity})`,
    );
  }
  if (result.pairs.length > SUMMARY_ROWS)
    console.log(`  ... ${result.pairs.length - SUMMARY_ROWS} more in the JSON`);
  const bands = { high: 0, moderate: 0, low: 0 };
  for (const pair of result.pairs) bands[pair.band] += 1;
  console.log(`Bands: ${bands.high} high, ${bands.moderate} moderate, ${bands.low} low`);
}

async function main() {
  const args = parseCli();
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const failAbove = args["fail-above"] === undefined ? null : Number(args["fail-above"]);
  if (failAbove !== null && !Number.isFinite(failAbove))
    throw new Error(`--fail-above needs a number from 0 to 100, got "${args["fail-above"]}"`);

  const chromium = await loadChromium();
  if (chromium === null) {
    console.error(INSTALL_HINT);
    return 2;
  }
  if (args.check) {
    try {
      const browser = await chromium.launch();
      await browser.close();
      console.log("Playwright and Chromium are ready.");
      return 0;
    } catch (error) {
      console.error(`Chromium did not start: ${firstLine(error)}`);
      console.error("Install the browser: npx playwright install chromium");
      return 2;
    }
  }

  const configPath = path.resolve(args.config);
  const raw = await readJson(configPath);
  const config = {
    anchorAttribute: "data-anchor",
    adjacencyPx: DEFAULTS.adjacencyPx,
    maxAnchors: DEFAULTS.maxAnchors,
    ...raw,
  };
  if (typeof config.baseUrl !== "string") throw new Error(`${configPath}: "baseUrl" is required`);

  const views = expandViews(config);
  if (views.length === 0)
    throw new Error(`${configPath}: no views. Add "routes" and "viewports", or "views".`);

  const browser = await chromium.launch();
  const measured = [];
  try {
    // oxlint-disable-next-line no-await-in-loop -- one view at a time keeps dev servers and timings stable
    for (const view of views) measured.push(await measureView(browser, config, view));
  } finally {
    await browser.close();
  }

  const options = { adjacencyPx: config.adjacencyPx, maxAnchors: config.maxAnchors };
  const result = {
    version: 1,
    generatedAt: new Date().toISOString(),
    config: { baseUrl: config.baseUrl, anchorAttribute: config.anchorAttribute, ...options },
    scoring: { weights: WEIGHTS, thresholds: { ...THRESHOLDS, depth: { good: 0, poor: config.maxAnchors } } },
    views: measured.map(({ anchors, ...view }) => ({
      ...view,
      anchorCount: anchors?.length ?? 0,
      anchors,
    })),
    pairs: scoreViews(measured, options),
  };

  const outPath = path.resolve(args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
  printSummary(result, path.relative(process.cwd(), outPath));

  const failed = result.views.filter((view) => view.error !== undefined).length;
  if (failed > 0) {
    console.log(`FAIL: ${failed} of ${result.views.length} views could not be measured.`);
    return 1;
  }
  if (failAbove !== null && result.pairs.some((pair) => pair.total > failAbove)) {
    console.log(`FAIL: at least one pair scores above ${failAbove}.`);
    return 1;
  }
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
