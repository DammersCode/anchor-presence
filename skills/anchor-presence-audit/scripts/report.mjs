#!/usr/bin/env node
// Renders anchor-audit.json as a chat table, a Markdown report, Mermaid charts, or a before/after comparison.
// Usage: node report.mjs [--in .anchor-audit/anchor-audit.json] [--format table|markdown|mermaid|all] [--out .anchor-audit/anchor-audit.md]
//        node report.mjs --before .anchor-audit/anchor-audit.json --in .anchor-audit/anchor-audit.after.json

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { THRESHOLDS, jumpThresholds } from "./score.mjs";

/** @typedef {ReturnType<typeof import("./score.mjs").scorePair>} PairScore */

const TABLE_ROWS = 15;
const CHART_BARS = 20;
const FLOW_CHAINS = 6;
const SUB_KEYS = ["jump", "gap", "depth", "aspect", "parity"];

const FORMATS = ["table", "markdown", "mermaid"];
const USAGE =
  "Usage: node report.mjs [--in .anchor-audit/anchor-audit.json] [--format table|markdown|mermaid|all]\n" +
  "                       [--out .anchor-audit/anchor-audit.md]\n" +
  "       node report.mjs --before <before.json> --in <after.json>   (prints a before/after table only)";

function parseCli() {
  return parseArgs({
    options: {
      in: { type: "string", default: ".anchor-audit/anchor-audit.json" },
      format: { type: "string", default: "table" },
      out: { type: "string", default: ".anchor-audit/anchor-audit.md" },
      before: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  }).values;
}

const pairLabel = (pair) => `${pair.page}: ${pair.a} vs ${pair.b}`;
const pairKey = (pair) => `${pair.page}\u0000${pair.a}\u0000${pair.b}`;
const cell = (text) => String(text).replaceAll("|", "\\|");

/** Reads and labels the jump input in the scale the audit used; a result without a scale is px. */
function jumpUnit(result) {
  const scale = result.config.jumpScale ?? "px";
  const thresholds = jumpThresholds(scale);
  if (scale === "px") {
    return {
      scale,
      thresholds,
      unit: "px",
      text: (value) => `${value} px`,
      p90: (p) => p.inputs.jumpP90Px,
      of: (j) => j.jumpPx,
    };
  }
  return {
    scale,
    thresholds,
    unit: "% of viewport width",
    text: (value) => `${value}% of viewport width`,
    p90: (p) => p.inputs.jumpP90Vw,
    of: (j) => j.jumpVw,
  };
}

function scoreTable(pairs) {
  const rows = pairs.map(
    (p) =>
      `| ${cell(pairLabel(p))} | ${p.total} | ${p.band} | ${SUB_KEYS.map((k) => p.sub[k]).join(" | ")} |`,
  );
  return [
    "| View pair | Total | Band | Jump | Gap | Depth | Aspect | Parity |",
    "| --- | --: | --- | --: | --: | --: | --: | --: |",
    ...rows,
  ].join("\n");
}

function chatTable(result) {
  const shown = result.pairs.slice(0, TABLE_ROWS);
  const more = result.pairs.length - shown.length;
  return `${scoreTable(shown)}${more > 0 ? `\n\n${more} more pairs in the JSON.` : ""}`;
}

/** @param {PairScore} pair @param {ReturnType<typeof jumpUnit>} jump */
function pairSection(pair, jump) {
  const { inputs, offenders } = pair;
  const lines = [
    `### ${pairLabel(pair)} — ${pair.total} (${pair.band})`,
    "",
    `| Input | Value | Sub-score |`,
    `| --- | --: | --: |`,
    `| Jump p90 | ${jump.text(jump.p90(pair))} over ${pair.counts.adjacentPairs} adjacent moves | ${pair.sub.jump} |`,
    `| Gap uncovered | ${Math.round(inputs.gapUncovered * 100)}% | ${pair.sub.gap} |`,
    `| Depth delta (worst) | ${inputs.depthDelta} | ${pair.sub.depth} |`,
    `| Aspect amp p90 | ${inputs.aspectAmp}x over ${pair.counts.sharedAnchors} shared anchors | ${pair.sub.aspect} |`,
    `| Missing in one view | ${Math.round(inputs.parityMissing * 100)}% of ${pair.counts.anchorIds} IDs | ${pair.sub.parity} |`,
  ];
  const largeJumps = offenders.jumps.filter((j) => jump.of(j) > jump.thresholds.good);
  if (largeJumps.length > 0) {
    lines.push("", "Largest jumps (sender move -> receiver move):", "");
    for (const j of largeJumps.slice(0, 5)) {
      const share = jump.scale === "px" ? "" : ` (${jump.text(j.jumpVw)})`;
      lines.push(
        `- \`${j.from}\` -> \`${j.to}\`: ${j.senderPx} px on ${j.sender} becomes ${j.jumpPx} px${share} on ${j.receiver}` +
          ` (${j.via.map((v) => (v === null ? "viewport" : `\`${v}\``)).join(" -> ")})`,
      );
    }
  }
  if (offenders.gaps.length > 0) {
    lines.push("", "Uncovered containers:", "");
    for (const g of offenders.gaps.slice(0, 5)) {
      const selector = g.example?.selector ?? null;
      const where = selector === null ? "" : `, for example \`${selector}\``;
      lines.push(
        `- ${g.view}: ${Math.round(g.uncovered * 100)}% of the box around ${g.memberCount} anchors under ` +
          `${g.parent === null ? "no anchored parent" : `\`${g.parent}\``}${where}`,
      );
    }
  }
  if (offenders.aspect.some((a) => a.amp >= THRESHOLDS.aspect.good)) {
    lines.push("", "Largest shape changes:", "");
    for (const a of offenders.aspect.filter((x) => x.amp >= THRESHOLDS.aspect.good).slice(0, 5)) {
      const sizes = Object.entries(a.sizes)
        .map(([view, size]) => `${size} on ${view}`)
        .join(", ");
      lines.push(`- \`${a.id}\`: ${a.amp}x (${sizes}) at \`${a.selector}\``);
    }
  }
  if (offenders.fallbacks.length > 0) {
    lines.push("", "Fallbacks:", "");
    for (const f of offenders.fallbacks.slice(0, 5)) {
      lines.push(
        `- \`${f.id}\` from ${f.sender} lands on \`${f.resolved}\` on ${f.receiver} (depth ${f.depth})`,
      );
    }
  }
  if (offenders.missing.length > 0) {
    const shown = offenders.missing.slice(0, 5).map((m) => `\`${m.id}\` (only on ${m.presentIn})`);
    lines.push("", `Missing in one view: ${shown.join(", ")}`);
  }
  return lines.join("\n");
}

function markdownReport(result) {
  return [
    "## Scores",
    "",
    `Measured ${result.views.length} views against ${result.config.baseUrl} on ${result.generatedAt.slice(0, 10)}.`,
    "Higher is worse: 0-20 low, 21-50 moderate, 51-100 high.",
    "",
    scoreTable(result.pairs),
    "",
    "## Findings per view pair",
    "",
    ...result.pairs.map((pair) => `${pairSection(pair, jumpUnit(result))}\n`),
  ].join("\n");
}

const chartLabel = (pair) => `"${pairLabel(pair).replaceAll('"', "'")}"`;

function barChart(title, pairs, value, max) {
  return [
    "```mermaid",
    "xychart-beta",
    `  title "${title}"`,
    `  x-axis [${pairs.map((pair) => chartLabel(pair)).join(", ")}]`,
    `  y-axis "${title}" 0 --> ${max}`,
    `  bar [${pairs.map((pair) => value(pair)).join(", ")}]`,
    "```",
  ].join("\n");
}

/** One flowchart per view pair: each missing anchor's chain up to the anchor that resolved. */
function chainFlowchart(pair) {
  const ids = new Map();
  const nodeId = (label) => {
    if (!ids.has(label)) ids.set(label, `n${ids.size}`);
    return ids.get(label);
  };
  const edges = new Set();
  const resolved = new Set();
  for (const f of pair.offenders.fallbacks.slice(0, FLOW_CHAINS)) {
    const end = f.chain.indexOf(f.resolved);
    const steps = end === -1 ? [...f.chain, "viewport"] : f.chain.slice(0, end + 1);
    for (let i = 0; i + 1 < steps.length; i += 1) {
      edges.add(`  ${nodeId(steps[i])} -->|"missing on ${f.receiver}"| ${nodeId(steps[i + 1])}`);
    }
    resolved.add(nodeId(steps.at(-1)));
  }
  return [
    `#### ${pairLabel(pair)}`,
    "",
    "```mermaid",
    "flowchart LR",
    ...[...ids].map(([label, id]) => `  ${id}["${label.replaceAll('"', "'")}"]`),
    ...edges,
    "  classDef resolved stroke-width:3px",
    `  class ${[...resolved].join(",")} resolved`,
    "```",
  ].join("\n");
}

function mermaidReport(result) {
  const pairs = result.pairs.slice(0, CHART_BARS);
  const jump = jumpUnit(result);
  const maxJump = Math.ceil(Math.max(jump.thresholds.poor, ...pairs.map((p) => jump.p90(p))));
  const jumpRows = pairs.map((p) => `| ${cell(pairLabel(p))} | ${jump.p90(p)} | ${p.sub.jump} |`);
  const flows = result.pairs
    .filter((p) => p.offenders.fallbacks.length > 0)
    .map((pair) => chainFlowchart(pair));
  return [
    "## Charts",
    "",
    "### Total risk per view pair",
    "",
    barChart("Total risk", pairs, (p) => p.total, 100),
    "",
    scoreTable(pairs),
    "",
    `### Jump p90 per view pair (${jump.unit})`,
    "",
    barChart(`Jump p90 (${jump.unit})`, pairs, (p) => jump.p90(p), maxJump),
    "",
    `| View pair | Jump p90 (${jump.unit}) | Jump sub-score |`,
    "| --- | --: | --: |",
    ...jumpRows,
    ...(flows.length === 0
      ? []
      : [
          "",
          "### Fallback chains",
          "",
          `Anchors missing in one view, and the anchor the cursor lands on instead (bold border). Up to ${FLOW_CHAINS} chains per view pair.`,
          "",
          flows.join("\n\n"),
        ]),
    "",
  ].join("\n");
}

function comparison(before, after) {
  const old = new Map(before.pairs.map((p) => [pairKey(p), p]));
  const rows = after.pairs.map((p) => {
    const prev = old.get(pairKey(p));
    const delta = prev === undefined ? "new" : p.total - prev.total;
    const changed = prev === undefined ? "" : SUB_KEYS.filter((k) => prev.sub[k] !== p.sub[k]);
    const detail = Array.isArray(changed)
      ? changed.map((k) => `${k} ${prev.sub[k]}->${p.sub[k]}`).join(", ")
      : changed;
    return `| ${cell(pairLabel(p))} | ${prev?.total ?? "-"} | ${p.total} | ${delta} | ${detail} |`;
  });
  const current = new Set(after.pairs.map(pairKey));
  for (const p of before.pairs) {
    if (!current.has(pairKey(p)))
      rows.push(`| ${cell(pairLabel(p))} | ${p.total} | - | missing | not measured after |`);
  }
  const [scaleBefore, scaleAfter] = [before, after].map((r) => r.config.jumpScale ?? "px");
  const note =
    scaleBefore === scaleAfter
      ? []
      : [
          `Jump scales differ (${scaleBefore} before, ${scaleAfter} after): jump deltas are not comparable.`,
          "",
        ];
  return [
    ...note,
    "| View pair | Before | After | Delta | Changed sub-scores |",
    "| --- | --: | --: | --: | --- |",
    ...rows,
  ].join("\n");
}

async function readResult(file) {
  const resolved = path.resolve(file);
  let text;
  try {
    text = await readFile(resolved, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${resolved}. Run measure.mjs first, or pass --in <file>.`, { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${resolved}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

async function main() {
  const args = parseCli();
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const result = await readResult(args.in);
  if (args.before !== undefined) {
    console.log(comparison(await readResult(args.before), result));
    return 0;
  }

  const formats = new Set(args.format === "all" ? FORMATS : args.format.split(",").map((f) => f.trim()));
  const unknown = [...formats].filter((f) => !FORMATS.includes(f));
  if (unknown.length > 0) throw new Error(`Unknown format: ${unknown.join(", ")}`);

  if (formats.has("table")) console.log(chatTable(result));

  const sections = [];
  if (formats.has("markdown")) sections.push(markdownReport(result));
  if (formats.has("mermaid")) sections.push(mermaidReport(result));
  if (sections.length > 0) {
    const text = `# Anchor presence layout audit\n\n${sections.join("\n")}`;
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, text);
    console.log(
      `Wrote ${path.relative(process.cwd(), outPath)} (about ${Math.round(text.length / 4)} tokens).`,
    );
  }
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
