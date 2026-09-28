# 029 Kanban example: the recommended layout pattern

Status: done · Branch: `main`

Outcome: the `kanban` scene ships with the example set, scored 0 (low) in the dogfood audit while every reflow scene scores 100 (high). The three reflow pages carry a worst-case note that links to it, and the layout design guide links it from the size/shape rule.

Owner request (2026-09-28): the existing example scenes all model the worst case — layouts that squish, reflow, or swap element trees. That serves the explanation, but a reader cannot copy it into a real app. Add one example built the recommended way, and mark the worst-case examples as deliberate.

## Scene: `kanban`

- A board with three fixed-width columns (To do / In progress / Done). Cards keep a fixed size in both panes; when the pane shrinks, the board scrolls horizontally instead of squishing. Same element positions in both layouts, so cursors stay put.
- Same markup in both layouts (the pane just gets a narrower viewport). No reflow, no column stacking.
- Column header: title, count, add button (`+`) that appends a card. Cards carry a delete button. Card add/remove is per-pane local state, like the `fallbacks` scene.
- Anchors: `board`, `board.column:<id>`, `board.column:<id>.add`, `board.card:<id>`, `board.card:<id>.delete`.
- A visibility policy hides a cursor whose anchor is scrolled out of the board, with an edge hint button that scrolls it into view (the `scroll` scene pattern, horizontal).

## Pages and notes

- New page `examples/kanban.mdx` in the Layouts group: intro, preview, what's in the demo, code, behavior reference, related.
- The three reflow pages (`basics`, `responsive-grid`, `table-and-cards`) get a `<Callout type="warn">` after the preview: the layout is deliberately the worst case; fixed-size, scrollable layouts keep cursors steady; link to the Kanban example.
- `layout-design.mdx`: link the Kanban example from the size/shape rule and Related.

## Verification

- Add the kanban pair to `research/presence-layout-audit-dogfood.config.json` and rerun the dogfood: the kanban pair must score clearly below the reflow pairs (Jump and Aspect sub-scores near zero for visible anchors), confirming the pattern by measurement.
- Gates 1–5. No e2e or apps/demo changes, so no Playwright run.
