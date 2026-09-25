# 028 Layout audit skill and layout design guide

Status: in progress · Branch: `dev` · Research: [research/presence-layout-audit.md](research/presence-layout-audit.md) (read the "Coordinator correction" first; the score formula there is binding)

## Goal

1. A docs guide that tells authors how to design layouts so remote cursors do not jump: keep the anchor structure alike across views, keep neighbor distances and sizes comparable, anchor containers, keep order stable.
2. A new shipped agent skill that audits an app for cursor-jump risk across viewports and UI states, scores each view pair, proposes fixes, and applies the fixes the user picks.

## Owner decisions

| Topic         | Decision                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience      | Library users. The skill ships in `skills/anchor-presence-audit/`, installable with `npx skills add`. We also run it on our demo and docs.                                                                    |
| Measurement   | Hybrid: static scan (anchors, breakpoints, toggles, routes), then a bundled Playwright script measures real anchor rects in the running app.                                                                  |
| States        | Derived from code, shown to the user, confirmed or extended before measuring.                                                                                                                                 |
| Viewports     | Breakpoints found in the code plus a fixed base set: 390, 768, 1280, 1440 px. The user confirms the list.                                                                                                     |
| Fix loop      | Report with a score per view pair and fix proposals (file + change) → user selects → apply → measure once more → show before/after → hand back to the user.                                                   |
| Output format | Before printing, ask: compact table in chat, Markdown report file, Mermaid charts in Markdown, or a combination. State the rough token cost of each. All formats render from one JSON that the script writes. |
| Charts        | `xychart-beta` bars for total and sub-scores per view pair and for jump distances, always followed by the same data as a table (fallback on renderers without xychart). `flowchart` for fallback chains.      |
| CI            | On demand only. The script supports `--fail-above <score>` so users can wire it into their own CI. No CI job in this repo.                                                                                    |
| Weights       | Fixed and documented (jump 35, gap 25, depth 15, aspect 15, parity 10). Dynamic anchor IDs are measured at runtime only. "Adjacent" means boxes within 24 px.                                                 |

## Deliverables

- `skills/anchor-presence-audit/SKILL.md` (steps with completion criteria, written per the `writing-for-agents` skill), `scoring.md` (metrics, thresholds, formula), `fixes.md` (fix catalogue mapped to sub-scores), `scripts/measure.mjs` (Playwright, config in → JSON out), `scripts/report.mjs` (JSON → table / Markdown / Mermaid), `audit.config.example.json`.
- Docs: `get-started/guides/layout-design.mdx` ("Designing layouts for presence") and a short section on the audit skill in `get-started/guides/ai-agents.mdx`. Troubleshooting links to the guide.
- Dogfood: run the skill's scripts against the docs example scenes and commit the Markdown report under `plans/research/`.

## Acceptance

- The scripts run on Node 20+ with only `playwright` as a dependency (the skill tells the user how to install it when missing).
- The dogfood report scores the eight example scenes and matches their intent (for example the fallbacks scene shows depth and parity findings).
- `bun run typecheck`, `lint`, `format:check`, `test`, `docs:build` pass.
