---
name: anchor-presence-audit
description: Audits an anchor-presence app for cursor-jump risk between layouts and proposes fixes. Use when asked to audit or score cursor-jump risk, when remote cursors jump between layouts, to review a layout for live presence, or before shipping responsive or collapsible layouts with live cursors.
compatibility: Requires Node 20+, playwright with Chromium, and a running instance of the app.
---

Anchor-presence resolves each remote cursor against the receiver's own layout. A cursor **jumps** when a short pointer move on the sender's screen becomes a long move on the receiver's screen. The cause is always a difference between the two layouts: neighbors that sit apart in the other layout, gaps with no anchored parent, anchors that change shape, anchors that exist in one layout only.

This skill measures that risk in the running app. A **view** is one route at one viewport in one UI state. Every **view pair** of the same page gets a score from 0 to 100; higher is worse. Sub-scores, formula, and bands: [scoring.md](scoring.md). Fix catalogue: [fixes.md](fixes.md).

The scripts do the heavy work and print short summaries. The JSON and the report files stay on disk; read only a summary, a table, or one pair's section.

Scripts, in `scripts/` next to this file (Node 20+, one dependency: `playwright`). Run them from the app root; `<skill>` is this skill's folder:

- `node <skill>/scripts/measure.mjs` measures and scores. It reads `.anchor-audit/audit.config.json` and writes `.anchor-audit/anchor-audit.json`; `--config` and `--out` change the paths. It exits with code 1 when a view cannot be measured. `--check` tests the Playwright setup. `--fail-above <score>` also exits with code 1 when a pair scores above it, for the user's own CI.
- `node <skill>/scripts/report.mjs --format table|markdown|mermaid|all` renders a report from `.anchor-audit/anchor-audit.json` into `.anchor-audit/anchor-audit.md`; `--in` and `--out` change the paths. `--format` also takes a comma list. `--before <json>` prints only a before/after table and writes no file.
- Both scripts print their usage with `--help`.

Keep every audit file in `.anchor-audit/` in the app root.

## Steps

### 1. Scan the code

Search the source and record each finding with its file and line:

- **Anchors**: every `data-anchor` attribute. If the code passes `anchorAttribute` to the provider or binding, search for that attribute too. Mark anchors that render only under a condition (`cond ? … : null`, `hidden md:block`, a breakpoint hook).
- **Routes**: the routes that render anchors. File routes (`app/**/page.*`, `pages/**`, `routes/**`) or router config (`path:`, `<Route path=`). An app without a router may switch views by query string or hash (`?page=orders`, `#/orders`); use those URLs as routes.
- **Breakpoints**: Tailwind `screens` in `tailwind.config.*` or `--breakpoint-*` in a CSS `@theme` block; with Tailwind and no overrides, the defaults 640, 768, 1024, 1280, 1536. Also `@media (min-width` / `(max-width`, `matchMedia`, `useMediaQuery`, and container queries.
- **Toggles**: controls that change which anchors render or where they sit. Sidebar collapse and expand, tabs (`role="tab"`, `aria-selected`), dialogs and sheets (`<dialog`, `aria-modal`), accordions and disclosures (`aria-expanded`, `<details>`), switches (`role="switch"`).

**Done when** the four lists exist with evidence, or a list is recorded as empty.

### 2. Propose the measurement matrix

Build views as routes × viewports × states:

- Routes: every route from step 1.
- Viewports: the base set 390, 768, 1280, 1440, plus each breakpoint width from step 1. Drop a breakpoint within 16 px of a base width.
- States: `default`, plus one state per toggle, written as the steps that reach it (see [Config reference](#config-reference)).

Show the matrix as a short table with the view count and the pair count. The script pairs every two views of the same route, so n views of one route give n(n−1)/2 pairs. When two layouts of one page live on different URLs (for example a separate mobile route), list them as explicit `views` with one shared `page` name. Ask the user to confirm, remove, or add rows.

**Done when** the user confirms the matrix.

### 3. Check the prerequisites

1. Ask for the URL of the running app, or offer to start its dev script. Request the URL once; continue only when it answers with HTTP 200.
2. Run `node <skill>/scripts/measure.mjs --check` from the app root.
3. If it prints the install hint, give the user the exact commands for the package manager the lockfile shows: `npm install -D playwright`, `pnpm add -D playwright`, `yarn add -D playwright`, or `bun add -d playwright`, then `npx playwright install chromium`. Install only with the user's consent, then run `--check` again.

**Done when** the URL answers and `--check` prints `Playwright and Chromium are ready.`

### 4. Measure

Write `.anchor-audit/audit.config.json` from the confirmed matrix. Start from [audit.config.example.json](audit.config.example.json). Run `measure.mjs`.

**Done when** the summary line reports every view measured (`Measured N/N views`). For an `ERROR` line (the script then exits with code 1), correct the URL, selector, or wait in the config and run again. When a state's selector cannot be found in the code, ask the user for it.

### 5. Report in the user's format

Ask which format the user wants, and state the rough cost in chat tokens:

| Format        | Content                                                                                                                             | Chat cost                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `table`       | One row per view pair (top 15): total, band, five sub-scores                                                                        | about 40 tokens per row, 600 for 15 rows                                |
| `markdown`    | A file: the score table, then per pair the inputs, largest jumps, gaps, shapes, fallbacks                                           | about 30 tokens (the path); the script prints the file's size in tokens |
| `mermaid`     | A file: bar charts of total and jump distance for the top 20 pairs, each followed by its data table, plus fallback-chain flowcharts | about 30 tokens (the path)                                              |
| a combination | `table,markdown`, `markdown,mermaid`, or `all`                                                                                      | the sum; the files merge into one                                       |

Run `report.mjs` with that format. Paste the table output unchanged. For a file, give its path. A report file can run to tens of thousands of tokens: never read it whole, only one pair's section.

**Done when** the user has the report in the chosen format.

### 6. Propose fixes

Work through every pair in the moderate or high band, highest total first:

1. Read that pair's findings: its `### <pair>` section in a Markdown report. Render one to a scratch path when the user chose another format, and read only that section.
2. For each sub-score of 50 or more, pick the matching fix from [fixes.md](fixes.md).
3. Find the source of each offender: search for its anchor ID, or for the template that builds it, such as `orders.row:${`. Confirm the element with the selector path from the report.
4. Write one proposal per fix: file and line, the concrete change, and the sub-score it lowers.

Present the proposals grouped by view pair and numbered, so the user can pick by number. A layout difference can be intended (a table that becomes cards on purpose); say so and propose the fix that keeps the design.

**Done when** every sub-score of 50 or more on a moderate or high pair has a proposal or a stated reason why no fix applies, and the user has picked.

### 7. Apply, measure again, hand back

1. Apply only the picked fixes. Run the project's typecheck.
2. Run `measure.mjs` with the same config and `--out .anchor-audit/anchor-audit.after.json`.
3. Run `report.mjs --before .anchor-audit/anchor-audit.json --in .anchor-audit/anchor-audit.after.json` and show the table. A pair marked `missing` was not measured in the second run; treat it as a pair that got worse until it measures again.

**Done when** the user has the before/after table, the list of changed files, and a note on every pair that got worse. One round per run: the user decides on the next round.

## Config reference

| Field             | Meaning                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`         | Required. The running app, for example `http://localhost:3000`.                                                                                                                        |
| `routes`          | Paths, crossed with `viewports` and `states`. The route is the page name for pairing.                                                                                                  |
| `viewports`       | Widths (height 900), or `{ "name", "width", "height" }` objects.                                                                                                                       |
| `states`          | Map of state name to a step list. `default` with no steps is the plain page.                                                                                                           |
| `views`           | Explicit views: `{ "page", "name", "url", "width", "height", "steps" }`. Views with the same `page` pair.                                                                              |
| `anchorAttribute` | Default `data-anchor`. Use the app's custom attribute when it sets one.                                                                                                                |
| `adjacencyPx`     | Default 24. Two anchors this close count as neighbors.                                                                                                                                 |
| `maxAnchors`      | Default 4. The chain length the app's binding sends.                                                                                                                                   |
| `jumpScale`       | Default `px`. `viewport` scores each jump as a percent of the receiver's viewport width. Use it when the views span phone and desktop widths. See [scoring.md](scoring.md#jump-scale). |
| `settleMs`        | Default 500. Wait after load and after the steps.                                                                                                                                      |
| `waitUntil`       | Default `load`. Playwright's navigation wait.                                                                                                                                          |
| `timeoutMs`       | Default 15000. How long to wait for the first anchor on a page.                                                                                                                        |

Step kinds, run in order: `{ "click": "<selector>" }`, `{ "press": "Escape", "selector": "<optional>" }`, `{ "setAttribute": { "selector", "name", "value" } }`, `{ "wait": 300 }` (milliseconds) or `{ "wait": "<selector>" }`.
