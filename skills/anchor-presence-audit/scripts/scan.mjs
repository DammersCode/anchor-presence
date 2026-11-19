#!/usr/bin/env node
// Static scan for step 1 of the audit: anchors, routes, breakpoints, toggles, and reflow patterns.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const USAGE = `Usage: node scan.mjs [--root <dir>] [--attribute <name>] [--json] [--max <n>]

Scans source files for the anchors, routes, breakpoints, toggles, and reflow patterns that drive cursor-jump risk.
Prints a short summary. --json prints the full result. --max caps each list (default 12).`;

const SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".git",
  ".turbo",
  ".anchor-audit",
  "coverage",
]);
const SOURCE = /\.(tsx|jsx|ts|js|mjs|vue|svelte|html|astro)$/u;
const STYLE = /\.(css|scss)$/u;

const REFLOW = [
  [
    "hidden-at-breakpoint",
    /\b(?:max-)?(?:sm|md|lg|xl|2xl):hidden\b|\bhidden\s+(?:sm|md|lg|xl|2xl):(?:block|flex|grid|inline)/u,
  ],
  ["axis-flip", /\b(?:sm|md|lg|xl|2xl):flex-(?:row|col)\b/u],
  ["column-count-change", /\b(?:sm|md|lg|xl|2xl):grid-cols-\d+/u],
  ["span-change", /\b(?:sm|md|lg|xl|2xl):(?:col|row)-span-\d+/u],
  ["order-change", /\b(?:sm|md|lg|xl|2xl):order-/u],
  ["stretch-item", /\bw-full\b.*\bdata-anchor|\bdata-anchor.*\bw-full\b/u],
  ["breakpoint-hook", /\b(?:useMediaQuery|useBreakpoint|useIsMobile|matchMedia)\b/u],
];
const TOGGLE =
  /role=["']tab["']|aria-selected|<dialog|aria-modal|aria-expanded|<details|role=["']switch["']|collapsed|isOpen|sidebarOpen/u;
const ROUTE_FILE = /(?:^|\/)(?:app\/.*page|pages\/.*|routes\/.*)\.(?:tsx|jsx|ts|js|vue|svelte)$/u;

function parseArgs(argv) {
  const args = { root: ".", attribute: null, json: false, max: 12 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--json") args.json = true;
    else if (a === "--root") args.root = argv[++i];
    else if (a === "--attribute") args.attribute = argv[++i];
    else if (a === "--max") args.max = Number(argv[++i]);
    else throw new Error(`Unknown option ${a}`);
  }
  if (!Number.isInteger(args.max) || args.max < 1) throw new Error("--max needs a positive integer");
  return args;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) yield* walk(path);
    else if (SOURCE.test(name) || STYLE.test(name) || name.startsWith("tailwind.config.")) yield path;
  }
}

function scan(root, attribute) {
  const attr = attribute ?? "data-anchor";
  const anchorRe = new RegExp(
    `${attr.replaceAll(/[.*+?^${"$"}{}()|[\]\\]/gu, "\\$&")}=(?:\\{?["'\`])([^"'\`]+)`,
    "gu",
  );
  const out = {
    attribute: attr,
    anchors: [],
    risks: {},
    routes: [],
    toggles: [],
    breakpoints: { widths: [], tailwind: [] },
  };
  const widths = new Set();
  for (const file of walk(root)) {
    const rel = relative(root, file).split(sep).join("/");
    const lines = readFileSync(file, "utf8").split("\n");
    if (rel.split("/").at(-1).startsWith("tailwind.config.")) {
      const m = /screens\s*:\s*\{([^}]*)\}/u.exec(lines.join("\n"));
      if (m !== null) out.breakpoints.tailwind.push(`${rel}: ${m[1].replaceAll(/\s+/gu, " ").trim()}`);
    }
    if (ROUTE_FILE.test(rel)) out.routes.push(rel);
    let hasAnchor = false;
    lines.forEach((line, index) => {
      const at = `${rel}:${index + 1}`;
      for (const m of line.matchAll(anchorRe)) {
        hasAnchor = true;
        const conditional = /&&|\?\s|hidden|null\s*\)/u.test(line);
        out.anchors.push({ id: m[1], at, conditional });
      }
      for (const m of line.matchAll(/@media[^{]*\((?:min|max)-width:\s*(\d+)px\)/gu))
        widths.add(Number(m[1]));
      for (const m of line.matchAll(/--breakpoint-\w+:\s*(\d+)px/gu)) widths.add(Number(m[1]));
      if (TOGGLE.test(line) && SOURCE.test(rel)) out.toggles.push(at);
      for (const [name, re] of REFLOW) if (re.test(line) === true) (out.risks[name] ??= []).push(at);
    });
    if (!hasAnchor)
      for (const name of Object.keys(out.risks))
        out.risks[name] = out.risks[name].filter((at) => at.startsWith(`${rel}:`) === false);
  }
  out.breakpoints.widths = [...widths].toSorted((a, b) => a - b);
  for (const name of Object.keys(out.risks)) if (out.risks[name].length === 0) delete out.risks[name];
  return out;
}

function summary(result, max) {
  const cap = (list) =>
    list.slice(0, max).join(", ") + (list.length > max ? `, +${list.length - max} more` : "");
  const lines = [`Anchor attribute: ${result.attribute}`];
  const conditional = result.anchors.filter((a) => a.conditional);
  lines.push(`Anchors: ${result.anchors.length} (${conditional.length} conditional)`);
  if (result.anchors.length > 0) lines.push(`  first: ${cap(result.anchors.map((a) => `${a.id} ${a.at}`))}`);
  if (conditional.length > 0) lines.push(`  conditional: ${cap(conditional.map((a) => `${a.id} ${a.at}`))}`);
  lines.push(`Routes: ${result.routes.length === 0 ? "none found" : cap(result.routes)}`);
  const widths = result.breakpoints.widths;
  lines.push(
    `Breakpoints: ${widths.length === 0 ? "none in CSS" : widths.join(", ")}${result.breakpoints.tailwind.length > 0 ? "; tailwind " + result.breakpoints.tailwind.join("; ") : ""}`,
  );
  const names = Object.keys(result.risks);
  lines.push(
    `Toggles: ${result.toggles.length === 0 ? "none found" : cap(result.toggles)}`,
    names.length === 0
      ? "Reflow patterns in files with anchors: none"
      : "Reflow patterns in files with anchors:",
  );
  for (const name of names)
    lines.push(`  ${name} (${result.risks[name].length}): ${cap(result.risks[name])}`);
  return lines.join("\n");
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === true) {
    console.log(USAGE);
  } else {
    const result = scan(args.root, args.attribute);
    console.log(args.json ? JSON.stringify(result, null, 2) : summary(result, args.max));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
