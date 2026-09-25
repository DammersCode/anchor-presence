# Research: a presence layout audit — docs page and agent skill

Status: research note, not a spec. No code changed by this document.

## Executive summary

Anchor Presence already documents the core failure mode: a pointer crossing a gap between anchors falls back to viewport, and viewport position maps to a different spot when layouts differ (`troubleshooting.mdx`, "Cursor jumps between two elements"). This note proposes a way to quantify that risk before a user hits it, a way to measure it (static and dynamic), a shape for shipping an audit skill, a fix catalogue mapped to the resolver's actual fallback order, and a docs page outline. Seven candidate metrics are evaluated against the resolver code; five combine into a proposed 0–100 "jump risk" score, styled after Cumulative Layout Shift (impact × distance) and Lighthouse (weighted, log-normal-curved sub-scores), with a worked example using the repo's own `table-and-cards` and `responsive-grid` demo scenes.

Five packaging and workflow questions were resolved by the owner during this research pass (relayed 2026-09-25) and are folded in below as decisions, not options: the skill ships as a new, separate, installable sibling to `skills/anchor-presence/` for use by library users, and this repo also runs it on its own demo/docs app; measurement is a two-phase static-then-dynamic pipeline where the dynamic phase needs a running instance of the target app; view/state discovery is derive-then-confirm, not fully autonomous; the skill's workflow is an interactive loop — propose (file+change-level fixes) → user selects → apply selected → re-measure → re-report; and the skill asks the user to choose the output form (chat table, Markdown report file, Mermaid charts in Markdown, or a combination) before printing anything, with all formats rendered from one JSON computed once. The remaining open questions (weight tuning, CI gating, minimum viewport list, and others) are listed at the end.

---

## 1. Metrics — quantifying jump risk between two layouts

### Sources

- Resolver order and fallback: `packages/dom/src/resolver.ts:61-159` (`findResolvableAnchor`, `resolveGeometry`) — walks the chain most-specific-first, uses first connected anchor with `width > 0 && height > 0`, else viewport, else hidden.
- Chain construction and cap: `packages/dom/src/pointer.ts:30-56` (`buildCursorPosition`) — chain is `registry.ancestors(target).slice(0, maxAnchors)`, `maxAnchors` default 4 (`packages/dom/src/binding.ts:52`, `:122-128`), protocol cap 8.
- u/v formula: `packages/dom/src/pointer.ts:46-47` (sender) and `packages/dom/src/resolver.ts:115-118` (receiver) — both `(coord - rect.origin) / rect.size`.
- `apps/docs/content/docs/get-started/guides/troubleshooting.mdx:44-48`, "Cursor jumps between two elements" — the one documented jump root cause: gap with no anchored parent → viewport fallback → different landing spot on a differently-arranged receiver.
- `apps/docs/content/docs/get-started/concepts/responsive-layouts.mdx` — worked pixel example of size difference resolving correctly (75% stays 75%); documents that this case is _not_ jump risk.
- CLS formula: web.dev, `layout shift score = impact fraction × distance fraction` (impact = unstable-element visible area / viewport area; distance = max shift distance / largest viewport dimension). Thresholds: good ≤ 0.1, needs improvement 0.1–0.25, poor > 0.25.
- Lighthouse scoring: developer.chrome.com, performance score = weighted average of per-metric scores; each metric score comes from a log-normal curve fit to HTTP Archive data, with two control points (25th percentile → score 50, 8th percentile → score 90); near-linear between score 0.50 and 0.92, diminishing returns above 0.96.

### Findings, metric by metric (verified against resolver/binding behavior)

| #   | Candidate                                                                                    | Does the resolver actually produce this failure?                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Verdict                                                                       |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| a   | Displacement of an anchor's normalized viewport position between layouts                     | Yes — `resolveGeometry` computes `x = rect.left + rect.width*u`; if the anchor's rect origin/size differs a lot between layout A and B, the _absolute_ screen position differs, which is expected and fine as long as the anchor itself is what's compared (per `responsive-layouts.mdx`, size difference alone is not jump risk). Useful only as a sanity signal, not a risk driver by itself.                                                                                                  | Keep, low weight                                                              |
| b   | Neighbor-distance ratio (adjacent anchors A vs B)                                            | Not modeled by the resolver directly, but it approximates what happens when a pointer moves continuously between two anchors and crosses a gap: `pointer.ts` samples the chain per pointermove, so a straight-line pointer path in one layout can pass through a wide gap in another. This is the closest proxy for "does the fallback trigger mid-drag."                                                                                                                                        | Keep, direct proxy for (e)                                                    |
| c   | Anchor size/aspect-ratio change (u,v amplification)                                          | Directly modeled: the resolver reapplies the _same_ u/v to a different `rect.width/height` (`resolver.ts:117-118`). A large aspect-ratio change turns a small sender-side offset into a large receiver-side pixel error even when the anchor itself resolves (tier stays `anchor`, but the point can land far from the semantically same sub-region, e.g. a button icon vs a stretched full-width button).                                                                                       | Keep                                                                          |
| d   | Gap coverage (fraction of an interactive container's area with no anchor or anchored parent) | Directly modeled: `findResolvableAnchor` only helps if some ancestor in the DOM path is a registered anchor. Area with no anchored ancestor at all can only resolve via viewport tier — exactly the jump root cause in `troubleshooting.mdx:44-48`. This is the single best predictor of jump risk.                                                                                                                                                                                              | Keep, highest weight                                                          |
| e   | Fallback depth (chain position that ultimately resolved)                                     | Directly modeled: `resolver.ts:69-77` iterates `cursor.anchors` in order; depth = index of the winning anchor. Depth 0 = exact match (safest); depth ≥ 1 up to `maxAnchors-1` = degraded (the resolved point can only be as precise as the _parent's_ rectangle, per `fallback-chain.mdx`'s "cursor degrades to the next anchor"); depth = chain length (nothing resolved) = viewport tier, worst case for cross-layout drift.                                                                   | Keep                                                                          |
| f   | Sibling-order changes (reordering)                                                           | Not modeled by resolver geometry at all — reordering does not change any individual anchor's own rect, and resolution is per-anchor-ID, not positional. It affects (b) neighbor-distance only, and only if the _visual adjacency_ used to justify a "pointer travels between these two" assumption breaks. Real risk, but it is a special case of (b), not a separate resolver-level signal.                                                                                                     | Fold into (b), do not weight separately                                       |
| g   | Anchors present in one state, absent in another                                              | Directly modeled: `AnchorRegistry.get` returns `null` for anything not currently registered (`registry.ts:59-63`); a conditionally-rendered anchor (`fallbacks.tsx`'s `.refund` column, hidden when `withActions` is false) forces the resolver past that depth. This is the _cause_ of high fallback depth (e) in many real apps, so treat it as the diagnostic explanation, not a separate score input — it is what a static scan can find that a single dynamic snapshot might miss (see §2). | Fold into (e)'s "why," surface separately in fix output, not in the score sum |

### Recommendation (own proposal)

Five independent score inputs, not seven: **(1) gap coverage, (2) fallback-depth delta, (3) neighbor-distance ratio, (4) aspect-ratio amplification, (5) anchor-presence parity** (the (g) case, kept as its own input because it is binary/structural and cheap to compute from a static+dynamic diff, unlike (f) which is genuinely just a modifier on (2)). This is an explainable-scoring design choice inspired by CLS's two-factor multiply and Lighthouse's weighted-sum-of-curved-subscores, not a documented external standard — no external prior art scores DOM-anchor jump risk directly.

---

## 2. Measurement — collecting anchor geometry reliably

### Sources

- `.agents/skills/agent-browser/SKILL.md` — a discovery stub; real workflow content is fetched at runtime via `agent-browser skills get core`, so this repo's copy cannot show the full command surface. It confirms: Chrome/Chromium via CDP, accessibility-tree snapshots with `@eN` refs, sessions/state persistence, a `dogfood` specialized skill for exploratory QA. It is a general web-automation tool, not anchor-aware.
- `plans/026-example-previews.md` — shows the demo already runs two layouts side by side in iframes over `BroadcastChannel`, and already reports `tier`/`anchorId` in a receiver status chip. This is a _reference implementation_ of dynamic dual-layout measurement, built for humans watching a page, not for an audit script, but its technique (two panes, same anchors, cross-report resolution tier) is directly reusable.
- `packages/dom/src/pointer.ts:39` — `registry.ancestors(target)`, and `packages/dom/src/registry.ts:69-81` — the exact ancestor-walk algorithm a measurement script must reproduce if it wants to compute a chain without instrumenting the library itself (walk `parentAcrossShadow` collecting elements with the anchor attribute).
- `AGENTS.md:52` — the repo's own gate uses `bunx playwright test --project=chromium` for `packages/dom`, `packages/react`, `apps/demo`, `e2e/`, confirming Playwright is the established dynamic-testing tool in this codebase (not agent-browser, which is for manual/exploratory checks per `AGENTS.md:82`).
- `apps/docs/content/docs/get-started/guides/troubleshooting.mdx:64-70` (jsdom vs a real browser) — explicit statement that `getBoundingClientRect()` is zeroed in jsdom, so real cross-layout correctness "needs a real-browser test suite." This directly rules out a jsdom/static-only measurement strategy for geometry.

### Findings

**Static scan** can cheaply find, with no browser:

- every `data-anchor="..."` (or configured attribute) literal and template-literal usage — a regex/AST pass over JSX/TSX finds the anchor ID space and its parent-nesting (structural chain) without measuring pixels.
- conditional rendering keyed on breakpoint state or a boolean flag (e.g. `fallbacks.tsx`'s `showOrders`, `withActions`), which flags candidate anchors that can vanish (metric (5), anchor-presence parity) before ever loading a browser.
- CSS that hides elements via media queries (`hidden md:block` Tailwind-style patterns, or bare `@media` rules) — flags a second class of same-anchor-vanishes-at-breakpoint risk that a single fixed-viewport dynamic pass might miss if the audit doesn't happen to test the exact breakpoint boundary.

Static scan **cannot** find: actual rect geometry, actual gap coverage, actual aspect-ratio change, or actual neighbor distance — all of that requires layout, i.e., a real browser.

**Dynamic measurement** (Playwright) is the only reliable source for the five score inputs in §1: emulate a viewport (`page.setViewportSize`), toggle a UI state (click a documented control), then run one `page.evaluate` that walks `document.querySelectorAll('[data-anchor]')` and calls `getBoundingClientRect()` per element, plus reconstructs each element's anchor chain via `closest` walks up the tree (mirroring `registry.ts`'s ancestor logic, since the registry itself is a private module-internal `Map`, not queryable from outside the page).

### Decision 2 (owner decision, relayed 2026-09-25): hybrid, two-phase, requires a running app

The measurement approach is **hybrid, two-phase, and requires a running target app** — not an open question. The two phases:

**Phase 1 — static scan (no browser, no running app).** Finds the candidate inventory cheaply:

- **Anchors**: every `data-anchor="..."` (or configured attribute) literal and template-literal usage, via a regex/AST pass over the app's source, plus the structural chain (parent nesting) implied by JSX/DOM nesting.
- **Routes**: grep the app's router config/file-based routes (Next.js `app/`/`pages/`, React Router `<Route>` elements) for route paths.
- **Breakpoint conditionals**: media queries (`@media (min-width:|max-width:)` in shipped or source CSS, Tailwind responsive prefixes, CSS-in-JS breakpoint helpers) and conditional rendering keyed on a breakpoint hook or matchMedia check.
- **Toggle controls**: elements with `aria-expanded`, `role="switch"`, `aria-selected`, or a `<button>`/`<input type="checkbox">` adjacent to a `data-anchor` region — candidate sidebar-collapse, tab, and panel-open/close controls.

Phase 1's output is a **derived candidate list**: routes, breakpoints, and toggles, each with the file/line evidence that produced it.

**Phase 2 — human checkpoint (decision 4, owner decision).** The skill shows the derived list to the user and lets them confirm or extend it before anything runs. This is not fully autonomous discovery: a static scan can miss a toggle with no ARIA signal, or over-include a decorative `<button>`, so the human is the final filter on what the dynamic pass actually measures. This checkpoint also fixes the plan Phase 2 executes — it is the point where the skill commits to a concrete (route × breakpoint × toggle-state) matrix.

**Phase 2 — dynamic measurement (Playwright / `agent-browser`), against a running app.** This phase needs a live dev server or deployed instance to point a browser at — it cannot run against source code alone. For each confirmed (viewport, state) combination: emulate the viewport (`page.setViewportSize`), reach the route, apply the toggles (click the confirmed controls in sequence), then run one `page.evaluate` that walks `document.querySelectorAll('[data-anchor]')` and calls `getBoundingClientRect()` per element, plus reconstructs each element's anchor chain via `closest` walks up the tree (mirroring `registry.ts`'s ancestor logic, since the registry itself is a private module-internal `Map`, not queryable from outside the page). The repo's own `agent-browser` skill (`.agents/skills/agent-browser/SKILL.md`) or Playwright directly can drive this phase; §3 below decides between them for the shipped script.

Static findings feed the dynamic plan directly: Phase 1's route list becomes the set of pages to visit, its breakpoint list becomes the viewport widths to emulate (one width on each side of every discovered boundary), and its toggle list becomes the click sequence per state — all subject to the human checkpoint before Phase 2 executes.

Static scan **cannot** find, and Phase 2 is the only source for: actual rect geometry, actual gap coverage, actual aspect-ratio change, or actual neighbor distance — all of that requires real layout, confirmed by `troubleshooting.mdx:64-70`'s statement that jsdom zeroes `getBoundingClientRect()`.

---

## 3. Skill packaging

### Sources

- `C:/Users/dahe/.claude/skills/writing-for-agents/SKILL.md` and `SKILL-MECHANICS.md` — model-invoked vs user-invoked tradeoff (context load vs cognitive load), progressive disclosure (in-file step → in-file reference → disclosed reference), leading words, router skills.
- platform.claude.com Agent Skills doc (fetched) — `SKILL.md` frontmatter requires `name` (≤64 chars, lowercase+hyphens, no "anthropic"/"claude") and `description` (≤1024 chars, states what + when); three-level progressive disclosure (metadata always loaded → SKILL.md body on trigger → bundled files/scripts loaded only when referenced/run); scripts execute via bash with only their _output_ entering context, never their source.
- `skills/anchor-presence/SKILL.md` — the shipped skill, model-invoked (`description` present, no `disable-model-invocation`), scoped to "add live cursors, or fix them," with disclosed reference files `anchors.md`, `transports.md`, `troubleshooting.md` loaded by name, not inline.
- `skills-lock.json` (repo root) — six skills declared, `{source, sourceType: "github", skillPath, computedHash}` per skill, `version: 1`; every entry is a _third-party_ skill pulled from a GitHub repo, none is the repo-authored `skills/anchor-presence/`, confirming that the lock file tracks only skills.sh-installed skills, not first-party ones the repo ships to others. (The vercel-labs `skills` README itself does not document the lock file's field semantics — WebFetch of `github.com/vercel-labs/skills` returned installation/discovery docs only, no lock-file schema. This repo's own `skills-lock.json` is therefore the primary evidence used above, per the task's fallback instruction.)
- `AGENTS.md:75-85` — repo-local skills for _this_ repo's own contributors live in `.agents/skills/`; `skills/anchor-presence/` is explicitly "the skill we ship to users of the library, not a skill for this repo."

### Findings

The audit skill is **not** a fit for the shipped `anchor-presence` skill:

- `anchor-presence`'s description is scoped to _adding_ and _fixing_ live cursors in one app the agent is actively wiring up — a narrow, model-invoked trigger tuned for integration work. An audit is a distinct workflow (survey many views, run a browser across a matrix, produce a scored report) with a different completion shape (a report, not working code) and different tools (needs Playwright/browser automation; the integration skill needs none).
- Per `SKILL-MECHANICS.md`'s splitting rule: split off a new skill "when you have a distinct leading word that should trigger it on its own." "Audit my layouts for cursor jump risk" is a distinct trigger phrase from "add live cursors" or "cursor lands on the wrong element" (the current skill's triggers) — folding both into one description would blur the trigger and cost every future `anchor-presence` invocation the audit skill's irrelevant context.
- Cramming both into one `SKILL.md` also breaks progressive disclosure: the audit workflow needs Playwright setup, a scoring reference, and a fix catalogue — none of which the plain integration flow ever needs, so bundling would force every integration run to skip past audit-only reference material.

### Decision 1 (owner decision, relayed 2026-09-25): audience, shipping location, dual use

Dropped as an open question. The decision:

- **Audience is library users**, not just this repo's own maintainers — the same audience as `skills/anchor-presence/`.
- **Shipping location**: a new **sibling directory** under `skills/`, alongside `skills/anchor-presence/` — not nested inside it, not a mode/branch of it, matching the "not a fit" findings above.
- **Installable the same way**: must work with `npx skills add` like the existing skill. `skills/anchor-presence/` carries no skill-specific entry in `skills-lock.json` itself (that file only tracks _this repo's own installed_ third-party skills, per §3's Sources above) — the installability requirement is about the _new skill being consumable the same way_ by an external project's `skills add`, i.e., a valid `SKILL.md` with frontmatter meeting the `name`/`description` rules (§3 Sources, platform.claude.com fields) at a path skills.sh can discover, not about adding a lock entry to this repo's own file.
- **Dual use**: the same skill must work both installed into an arbitrary external user app, and run against this repo's own demo/docs app for dogfooding. This constrains the design to make no repo-specific assumptions in its core (no hardcoded knowledge of `apps/demo` or `apps/docs`) — the discovery phase (§2) must find routes/anchors/breakpoints generically in both cases, and any repo-specific dogfooding config (e.g., which dev server command starts the demo) lives in a local, non-shipped config the skill reads if present, not in the skill's own instructions.

### Decision 3 (owner decision, relayed 2026-09-25): fix workflow shape

Dropped as an open question. The skill's flow is an interactive loop, not a one-shot scan-and-report:

1. **Propose**: the report names, per finding, a specific file and a specific change (e.g. "`components/Sidebar.tsx:42` — add `data-anchor=\"nav\"` to the `<nav>` wrapper"), not just a fix category from §4's catalogue.
2. **Select**: the user picks which proposed fixes to apply, from the report.
3. **Apply**: the skill edits only the selected files with the selected changes.
4. **Re-measure**: the skill re-runs the Phase 2 dynamic pass (§2) against the now-changed app.
5. **Re-report**: the skill shows the before/after score change per view pair, using the same output-format choice as the first report (Decision 5, below).

This changes `SKILL.md`'s step list from "scan → report" to "discover → confirm → measure → score → propose (file+change) → select → apply → re-measure → re-report," and it means the skill needs write access to the target app's source, not just read and browser-automation access.

### Decision 5 (owner decision, relayed 2026-09-25): output format is a user choice, computed once

Dropped as an open question ("which output formats should the skill support"). Before printing any result, the skill **asks the user** which output form they want:

- **(a) Compact table in chat** — cheapest in chat tokens; a plain Markdown table, one row per view pair, columns for score and band.
- **(b) Markdown report file** — a written file with the table plus per-anchor breakdowns and the file+change fix proposals; moderate chat cost (the skill states the file path in chat, not the full content).
- **(c) Mermaid charts embedded in Markdown** — text-based diagrams, so this option stays cheap in chat tokens the same way (b) does: the diagram source is Mermaid syntax, generated by the bundled script into a `.md` file, and only the file path need reach chat.

Any combination of (a)/(b)/(c) is available. The skill states each option's rough chat-token cost when asking, so the user can pick based on how much they want printed inline versus written to disk.

**Architecture**: the bundled measurement/scoring script computes the underlying per-view-pair, per-anchor data **once**, as JSON (the same JSON `scripts/score.mjs` already produces per §1/§4). Each output format is a separate **renderer** consuming that one JSON, not a re-computation:

- the chat-table renderer prints a small Markdown table straight from the JSON (no file I/O);
- the Markdown-report renderer writes a `.md` file from the same JSON;
- the Mermaid renderer writes Mermaid code blocks (generated from the same JSON) into a `.md` file — generation happens inside the bundled script, from data, never by the agent hand-writing chart syntax from a data dump in its own context.

This keeps the heavy lifting (data-to-diagram-syntax generation) inside the bundled script and off the agent's own context — the agent never pastes chart data into chat, it only reports the output file's path, matching platform.claude.com's Level 3 guidance that a script's _output_, not its code or intermediate data, is what should enter context.

**Mermaid diagram types, mapped to what each communicates, grounded in actual renderer support (verified 2026-09-25, not assumed):**

| Diagram               | Communicates                                                                                                                                                                    | Renderer support                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flowchart` / `graph` | Fallback chains: which anchor chain segment resolved vs. fell back, one node per chain link, styled to show the winning depth (metric 2, §1)                                    | Long-standing, broadly supported — GitHub's own diagram docs demonstrate `flowchart` explicitly as a working example. Safe default with no support risk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `xychart-beta`        | Bar chart of score-per-view-pair, and a second use for per-anchor displacement magnitude                                                                                        | Present in current Mermaid (confirmed via mermaid.js.org's own XY Chart page, referenced against Mermaid 12.0.0), but the `-beta` suffix in its own directive name signals the feature is still new; this research pass could not confirm from mermaid.js.org whether it has graduated from beta or find an explicit stability statement. GitHub's Markdown docs do not name `xychart-beta` as a confirmed-supported type — they only confirm flowchart, sequence, and pie explicitly and otherwise tell the user to self-check with Mermaid's `info` directive inside their own renderer. **Treat as unconfirmed for GitHub rendering; verify with a live test render before depending on it, and fall back to a plain Markdown table (option a/b) for the score-per-view-pair chart if it fails to render.** |
| `quadrantChart`       | Plotting size-change (aspect-ratio amplification, metric c/4) against position-shift (displacement, metric a) per anchor, one point per anchor, one quadrant plot per view pair | Same caveat as `xychart-beta`: present in current Mermaid documentation but not confirmed as a GitHub-rendered type by GitHub's own docs. **Treat as unconfirmed; fall back to a plain data table (anchor, size-change %, position-shift %) if it fails to render.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Because GitHub's own instructions are to verify Mermaid version/diagram support at the point of rendering rather than assume a fixed list, the skill's Mermaid renderer should degrade gracefully: attempt `xychart-beta`/`quadrantChart` where useful, but always pair them with (or fall back to) the universally-supported `flowchart` and plain tables, so a report never depends entirely on a diagram type whose support could not be confirmed in this research pass.

**Before/after comparison for the re-measure step** (Decision 3's last step): render as a small Markdown table (before score, after score, delta, per view pair with an applied fix) rather than a chart — a two-column-plus-delta comparison is clearer as text than as a diagram, and it sidesteps the `xychart-beta` support question entirely for the one output every audit run will actually produce.

### Recommendation (own proposal, updated for decisions 1/3/5)

Ship a **new, separate, model-invoked skill** (own name, e.g. `anchor-presence-layout-audit`, ≤64 chars, lowercase+hyphens per the frontmatter rule above), living beside `skills/anchor-presence/` in the same `skills/` tree (same install channel, same skills.sh distribution path, per Decision 1), not inside `.agents/skills/` (that tree is for this repo's own contributors, not for library users, per `AGENTS.md:76-85`).

Proposed file layout, following the shipped skill's own disclosed-reference pattern (`anchors.md`, `transports.md`, `troubleshooting.md` beside `SKILL.md`), extended for the decided propose/select/apply/re-measure loop and the JSON-once/render-per-format architecture:

```
skills/anchor-presence-layout-audit/
  SKILL.md              — steps: discover → confirm → measure → score → propose → select → apply → re-measure → re-report
  scoring.md            — the formula, weights, thresholds (disclosed reference, §4 below)
  discovery.md          — route/state/breakpoint discovery heuristics and the confirm checkpoint (disclosed reference)
  fixes.md              — the fix catalogue (§4), used to turn a score finding into a file+change proposal
  scripts/
    discover.mjs        — static scan: anchors, routes, breakpoints, toggle candidates → candidate-list JSON
    measure.mjs         — Playwright script: confirmed viewport × state matrix, against a running app → raw geometry JSON
    score.mjs           — pure function: geometry JSON (two layouts) → one score JSON (§1/§4 data, computed once)
    report-table.mjs    — renders the score JSON as a compact Markdown table (chat-cost: lowest)
    report-markdown.mjs — renders the score JSON as a Markdown report file
    report-mermaid.mjs  — renders the score JSON as Mermaid code blocks in a Markdown file (chat-cost: a file path only)
```

**Framework-agnostic design**: the _measurement contract_ is "given a URL/local dev server and an anchor attribute name, return `{anchorId, rect, chainDepth}[]` per (viewport, state) combination" — this is pure DOM (`querySelectorAll`, `getBoundingClientRect`, `closest`), with zero React/Next.js API surface, so it works against any framework's rendered output, for both the external-user-app case and this repo's own demo/docs case (Decision 1's dual use). The _state-toggle_ step is the only framework-flavored part (finding "the sidebar collapse button" is app-specific, not framework-specific), and it is driven by the discovery heuristics in §2, not by React-specific selectors. The demo app being React is incidental — nothing in `packages/dom` (the layer the audit actually measures against) imports React (`packages/dom/src/*.ts`, confirmed zero React imports across resolver/binding/pointer/registry).

`scripts/measure.mjs` can use Playwright directly (already the repo's dynamic-test tool of record per `AGENTS.md:52`) or the repo's `agent-browser` skill — the owner's hybrid-measurement decision (§2) names both Playwright and `agent-browser` as acceptable dynamic drivers. Playwright is preferable for the shipped, deterministic, CI-friendly script since it needs no separately-installed external CLI (`agent-browser` requires `npm i -g agent-browser`), while `agent-browser` remains a reasonable choice when an agent session drives the audit interactively rather than through the bundled script.

---

## 4. Fix catalogue — mapped to metrics and verified against the resolver

| Fix                                                                     | Mechanism verified against code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Metric(s) improved                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Give a container its own anchor (e.g. `data-anchor="nav"` on a sidebar) | `troubleshooting.mdx:48` and `resolver.ts:69-77`: a parent anchor in the chain gives the resolver a fallback target before viewport, so a pointer crossing the gap between two children still resolves to the shared parent's rect instead of a raw viewport ratio.                                                                                                                                                                                                                                                                           | (1) gap coverage — directly shrinks uncovered area; (5) anchor-presence parity if the container itself is stable across layouts even when children are not                                                                               |
| Equal item sizes across breakpoints                                     | `resolver.ts:117-118` reapplies the sender's u/v to the receiver's own rect size; when item aspect ratio is preserved, the same u/v lands on the analogous sub-region on both sides.                                                                                                                                                                                                                                                                                                                                                          | (4) aspect-ratio amplification — directly targeted; this is the exact mechanism the metric measures                                                                                                                                      |
| Stable ordering (avoid reordering the same items across states)         | Resolution is per-anchor-ID (`registry.ts` keys by string ID, not position), so reordering never breaks _exact-anchor_ resolution by itself. It only matters for a pointer path crossing between two anchors — reordering changes which anchor is "next to" which.                                                                                                                                                                                                                                                                            | (3) neighbor-distance ratio only — verified this fix does _not_ help gap coverage or fallback depth, contrary to an intuitive assumption that "reordering is bad for anchors" in general                                                 |
| Shared anchor IDs across collapsed/expanded variants                    | `fallback-chain.mdx` and `responsive-layouts.mdx`'s sidebar example: the _same_ ID registered in both states means `AnchorRegistry.get(id)` succeeds in both, so the chain never needs to fall back at all for that item.                                                                                                                                                                                                                                                                                                                     | (5) anchor-presence parity — directly eliminates the gap; (2) fallback-depth delta drops to zero for that anchor                                                                                                                         |
| Treat icon-only collapsed nav items as square anchors                   | Not separately modeled by the resolver — this is really an instance of "equal item sizes across breakpoints" (aspect ratio: a labeled nav item is wide/short, an icon-only one is square) restated for the collapsed-sidebar case specifically.                                                                                                                                                                                                                                                                                               | (4) aspect-ratio amplification — same mechanism, same metric; this is a specific application, not a distinct fix category                                                                                                                |
| Split a large anchor into child anchors                                 | `pointer.ts:39` chain is `registry.ancestors(target).slice(0, maxAnchors)` — a large anchor with no children inside it means every pointer position over its whole area reports the _same_ anchor ID with a u/v spanning the full rect; if the receiver's version of that large region has very different internal proportions (e.g. content reflows inside it), the u/v still linearly maps but can point at a different _sub-element_ semantically. Splitting gives the resolver a more specific, better-matched anchor first in the chain. | (3) neighbor-distance ratio (finer-grained anchors reduce the gap a pointer path must cross) and (4) aspect-ratio amplification (smaller anchors are less likely to have wildly different aspect ratios than the page shell they sit in) |
| Do not anchor decorative wrappers                                       | `skills/anchor-presence/anchors.md:22`: "Skip decorative wrappers — a chain of one meaningful parent beats four vague ones." Verified against `pointer.ts:39-49`: every registered ancestor in the chain consumes one of the `maxAnchors` (default 4) slots; a decorative wrapper anchor wastes a chain slot that could hold a more useful semantic parent, and dilutes (2) fallback-depth's meaning (a "depth 1" fallback to a decorative div is not actually safer than depth 2 to a real semantic parent).                                 | (2) fallback-depth delta — keeps the chain's depth numbers meaningful; indirectly (1) gap coverage by freeing chain budget for real anchors                                                                                              |
| Choose breakpoints that preserve proportions                            | Not a resolver-level mechanism at all — this is a design-time choice upstream of anything the resolver can see. It reduces how often (4) triggers in the first place, by avoiding breakpoints that turn (say) a 3-column grid into 1 column with drastically different card proportions.                                                                                                                                                                                                                                                      | Preventive, upstream of (4); cannot be verified in resolver code because it is a choice made before any anchor exists                                                                                                                    |

All eight example fixes given in the task check out against actual resolver/binding behavior; none required rejecting one as ineffective, but "reordering" and "icon-only square anchors" are shown above to be _narrower_ than they first appear (mapped to one metric each, not several).

**Per Decision 3 (§3)**, the skill's report does not stop at this catalogue's category level. Each finding names the specific fix category from this table, then a concrete file and change: for example, a gap-coverage finding on a discovered sidebar maps to "give a container its own anchor," which the skill turns into "`components/Sidebar.tsx:18` — add `data-anchor=\"nav\"` to the `<nav>` element wrapping the discovered nav items," using the file path and line the discovery phase (§2) already recorded for that DOM region. This table is therefore also the reference `fixes.md` (§3's file layout) uses to go from "which metric is bad" to "which category of edit to propose," before the skill fills in the specific file/line from its own discovery data.

---

## 5. Docs outline — "Designing layouts for presence"

### Sources

- `apps/docs/content/docs/get-started/meta.json` — the `get-started` tab already holds `concepts/responsive-layouts` and `guides/troubleshooting`; this new page is guidance that sits between the two (more prescriptive than a concept page, more general than one troubleshooting symptom).
- `AGENTS.md:26-39` — docs style: simple-english prose, no first-person, timeless language ("no now/new/currently"), one-paragraph problem statement before sections for example pages, numbered lists only when order matters, `<Callout type="warn">` for condition-then-risk warnings.
- `plans/026-example-previews.md`'s scene table — confirms `responsive-grid` and `table-and-cards` are the two demo scenes purpose-built to show cross-layout anchor behavior, making them the natural "see it live" links from a new guidance page.

### Recommendation (own proposal)

Place it as a **new guide** under `get-started/guides/`, alongside `troubleshooting.mdx` and `performance.mdx`, not under `concepts/` (concepts explain _how the mechanism works_; this page is prescriptive _advice for authors_, matching the guides tab's existing role — `security.mdx`, `performance.mdx`, `troubleshooting.mdx` are all "how to do X well" pages, not mechanism explainers).

- **Slug**: `get-started/guides/designing-layouts` (file: `apps/docs/content/docs/get-started/guides/designing-layouts.mdx`)
- **meta.json**: add `"guides/designing-layouts"` to `apps/docs/content/docs/get-started/meta.json`'s `pages` array, under the existing `---[BookOpen]Guides---` heading, ordered before `troubleshooting` (design guidance precedes fixing symptoms) and before `ai-agents` (general guidance before the agent-specific entry point).

Sections (one-paragraph problem statement first, per the example-page convention, then sections — this is a guide page, not an example page, so no live-demo/install-command/code-tabs structure is required, but the "problem → sections" shape still applies):

1. **Problem statement** (one paragraph): two viewers with different layouts can resolve the same anchor to very different places when the pointer crosses unanchored space; this page gives rules that keep that difference small.
2. **Give every interactive region a container anchor** — the gap-coverage fix, cites `troubleshooting.mdx`'s nav example.
3. **Keep the same anchor ID across states** — sidebar collapsed/expanded, tab switches; cites `fallback-chain.mdx` and `responsive-layouts.mdx`.
4. **Match aspect ratio across breakpoints where possible** — the u/v amplification fix; worked mini-example reusing the `responsive-layouts.mdx` 160px→96px button numbers, extended to a case with an aspect-ratio change.
5. **Prefer splitting large anchors over one big region** — chain-budget reasoning from `anchors.md`.
6. **Skip decorative wrappers** — direct quote/paraphrase of the existing `anchors.md` rule, promoted from the shipped skill into user-facing docs.
7. **Related** (per `AGENTS.md:39`'s example-page convention, reused here for consistency): links to `concepts/responsive-layouts`, `concepts/fallback-chain`, `guides/troubleshooting`, `examples/responsive-grid`, `examples/table-and-cards`.

This page **does not** cover the scoring/audit skill from §1–§3 above — that is a separate, more technical concern (a tool page or a guide of its own, e.g. `guides/ai-agents.mdx`'s sibling), and mixing "advice for a human author" with "how to run an automated scorer" would violate the one-paragraph-problem-statement-per-page convention observed across existing guides.

---

## The proposed score formula (own proposal, concrete)

> **Coordinator correction (2026-09-25).** The first version gated neighbor distance behind gap coverage ("a large neighbor-distance ratio with full gap coverage is not a jump risk"). That is wrong for the owner's core concern: when user A moves a few pixels from anchor X to an adjacent anchor Y, user B's cursor moves from X to Y in B's layout. If X and Y sit far apart in B, B sees a large jump even with full anchor coverage and no fallback. The **jump** term below is therefore an independent, primary input, measured in pixels, in both directions (A→B and B→A).

**Inputs**, computed per view pair (layout A, layout B) of the same page and state set:

- `jump_px`: for every **adjacent pair** (X, Y) in the sender layout (two anchors whose boxes are within `adjacency_px` = 24 px of each other, so a short pointer move crosses from one to the other), the receiver-side jump is the distance in the receiver layout between the point where the pointer leaves X and the point where it enters Y (the facing-edge midpoints of X and Y in the receiver layout). Take the 90th percentile over all adjacent pairs, in both directions. This is the pixel distance the remote cursor travels for a pointer move of about `adjacency_px` on the sender.
- `gap_uncovered`: fraction of each interactive container's area (for example `nav`, `orders`) with no registered anchor or anchored ancestor, in the receiver layout. Range 0–1. A pointer in such a gap resolves at the viewport tier.
- `depth_delta`: `|fallback_depth(B) - fallback_depth(A)|`, where `fallback_depth` is the winning chain index (0 = exact, up to `maxAnchors - 1`; a viewport-tier resolution scores `maxAnchors`). Range 0–`maxAnchors`.
- `aspect_amp`: for one anchor present in both layouts, `max(ratio_A, ratio_B) / min(ratio_A, ratio_B)` where `ratio = rect.width / rect.height`. Range 1–∞, clamp display at 10. High values stretch u/v, so the cursor lands in a visibly different spot inside the element.
- `presence_parity`: 1 if the anchor ID exists and is measurable (per `isMeasurable`, `resolver.ts:57-59`) in both layouts, 0 if missing in one. Binary.

**Sub-scores** (0–100 each, higher = worse risk), capped-linear (a log-normal fit needs a real-world corpus that does not exist yet):

```
score(x, good, poor) = clamp(100 * (x - good) / (poor - good), 0, 100)
```

| Sub-score | x                                | good  | poor                     |
| --------- | -------------------------------- | ----- | ------------------------ |
| Jump      | `jump_px` (p90, both directions) | 40 px | 240 px                   |
| Gap       | `gap_uncovered`                  | 0.05  | 0.40                     |
| Depth     | `depth_delta`                    | 0     | `maxAnchors` (default 4) |
| Aspect    | `aspect_amp`                     | 1.3   | 3.0                      |
| Parity    | `1 - presence_parity`            | 0     | 1                        |

**Combined score** (Lighthouse-style weighted sum):

```
risk_0_100 = round(0.35 * Jump + 0.25 * Gap + 0.15 * Depth + 0.15 * Aspect + 0.10 * Parity)
```

Weights (own proposal, not tuned against real data): jump 35% (the owner's primary symptom), gap 25% (the documented viewport-fallback jump), depth 15%, aspect 15%, parity 10%. Each sub-score is reported next to the total, so a reader sees _why_ a pair scores badly, and every fix in the catalogue names the sub-score it lowers. Sibling reordering has no term of its own: it shows up directly in `jump_px`, because reordered neighbors sit far apart in the other layout.

**Bands** (own proposal, mirroring CLS's three-tier and Lighthouse's pass/average/fail coloring):

- 0–20: low risk (green)
- 21–50: moderate risk (amber)
- 51–100: high risk (red)

### Worked numeric example

Using `apps/docs/components/examples/table-and-cards.tsx` (wide = `InvoiceTable`, narrow = `InvoiceCards`, `apps/docs/components/examples/table-and-cards.tsx:56-123`), anchor `invoices.row:INV-2042.amount`:

- Both layouts register the same anchor ID (`field(invoice, "amount")`, line 34) inside a parent `invoices.row:INV-2042` inside `invoices` (lines 71, 101, 128) — so `presence_parity = 1` for every field in this scene. `Parity` sub-score = 0.
- Wide table cell: right-aligned `<td>` roughly 90×36 px in a dense row (`px-3 py-2.5`, `text-xs`). Narrow card: the amount sits in its own grid cell, roughly 70×20 px (`text-xs`, tighter `py-1.5` card). `aspect_amp = max(90/36, 70/20) / min(...) = max(2.5, 3.5)/min(2.5,3.5) ≈ 1.4`. Against thresholds (good 1.3, poor 3.0): `Aspect` sub-score ≈ `100*(1.4-1.3)/(3.0-1.3) ≈ 5.9`.
- The whole `invoices` container is itself anchored (line 128), so the row and its fields always have a registered ancestor even if a specific field anchor were missing: `gap_uncovered` for this container ≈ 0 (every pixel inside `data-anchor="invoices"` is covered by at least the container). `Gap` sub-score = 0, so `geometric = 0` regardless of `Neighbor`.
- `fallback_depth` for `.amount` is 0 in both layouts (exact anchor resolves directly in both) → `depth_delta = 0` → `Depth` sub-score = 0.

`combined = 0.40*0 + 0.25*0 + 0.20*5.9 + 0.15*0 ≈ 1.2` → **risk ≈ 1/100, low risk band.** This matches the scene's design intent (per `plans/026-example-previews.md`: "cursor on a cell lands on the same field inside the card") — the worked score confirms the demo is a _good_ example, not a risky one.

Contrast with `apps/docs/components/examples/fallbacks.tsx`'s `orders.row:1042.refund` anchor: wide layout renders it (`withActions=true`, line 42-52); narrow layout (`layout==="narrow"`) never renders the `<td>` at all (line 42's `withActions` ternary), so `presence_parity = 0` for that anchor in the narrow layout. `Parity` sub-score = 100. Its nearest surviving ancestor is `orders.row:1042` (still present, line 34) — `fallback_depth` goes from 0 (wide, exact button) to 1 (narrow, falls back to the row) → with `maxAnchors=4`, `depth_delta=1` → `Depth` sub-score = `100*1/4 = 25`. The row itself sits inside the anchored `orders` table (line 31) and `shop` container (line 66), so gap coverage stays low (`Gap` sub-score ≈ 0–5, assume 5 for a small margin/padding sliver): `geometric ≈ 100*0.05*(0.5+0.5*Neighbor/100)`; even at a high `Neighbor` sub-score of 60, `geometric ≈ 100*0.05*0.8 = 4`.

`combined = 0.40*4 + 0.25*25 + 0.20*0(no size to compare, anchor absent) + 0.15*100 ≈ 1.6 + 6.25 + 0 + 15 ≈ 22.9` → **risk ≈ 23/100, moderate risk band** — correctly flags this scene as the one purpose-built to demonstrate fallback behavior (`anchors-and-fallbacks` in `apps/docs/content/docs/examples/meta.json`), riskier than `table-and-cards` but not "high," consistent with the fallback chain still landing on a sensible parent rather than viewport.

---

## Coordinator notes on the worked example

The worked example below predates the correction and omits the jump term. Under the corrected formula, `table-and-cards` is not automatically low risk: moving from the status cell to the adjacent amount cell in the table moves the remote cursor from the status pill (top right of the card) to the amount (second line, left) in the card layout. The skill must measure that, not assume it.

## Open questions for the owner

Five packaging/workflow questions this research pass originally listed here were resolved by the owner (relayed 2026-09-25) and are now decisions folded into §§2–3 above, not open questions: audience/shipping location/dual-use (§3, Decision 1), the static-then-dynamic measurement pipeline and its running-app requirement (§2), the propose/select/apply/re-measure fix workflow (§3, Decision 3), derive-then-confirm view/state discovery (§2), and the ask-first, JSON-once/render-per-format output choice including the Mermaid chart types (§3, Decision 5). The genuinely unresolved questions:

1. **Weight tuning.** The 40/25/20/15 split and the good/poor thresholds in the score formula are this document's own proposal with no real-usage data behind them (unlike Lighthouse's log-normal curves, which are fitted to HTTP Archive). Should the first shipped version use these as fixed defaults, or ship them as configurable and gather real audit runs before treating any number as authoritative?
2. **CI gating.** Should a failing score block a PR (like a Lighthouse budget), only warn, or only ever run on demand via the skill? The repo's own gate list (`AGENTS.md:45-52`) has no visual/geometry budget today.
3. **Minimum supported viewport list.** §2 proposes deriving breakpoints from shipped CSS; is there a fixed minimum set (e.g. 375/768/1280/1920) the owner wants tested unconditionally regardless of what the CSS scan finds, similar to how Lighthouse fixes its own device emulation profiles?
4. **Neighbor-distance path model.** The proposed `neighbor_ratio` assumes sibling anchors under a shared registered parent approximate a real pointer path. Is there a preferred way to model an actual likely pointer path (e.g. reading order, tab order) instead of raw sibling adjacency, for apps where visual and DOM order diverge?
5. **Score for missing-both-sides anchors.** The current formula treats "anchor exists in A, missing in B" (parity=0) but does not define behavior for an anchor that is a known false-positive from the static scan (e.g. an anchor ID assembled dynamically that the static scanner cannot resolve to a literal). Should the skill require a manual anchor-ID allowlist for such cases, or attempt runtime discovery only?
6. **Re-measure iteration limit.** Decision 3's propose/select/apply/re-measure loop has no stated stopping rule. If a re-measured score is still high after an applied fix, does the skill offer another propose/select/apply round automatically, cap the number of rounds, or always hand control back to the user after one re-measure?
7. **Mermaid chart-type confirmation.** §3's Mermaid recommendation flags `xychart-beta` and `quadrantChart` as present in current Mermaid documentation but unconfirmed for GitHub's renderer specifically (GitHub's own docs point users to a runtime `info` self-check rather than publishing a fixed supported-type list). Should the skill attempt these richer types by default and fall back on render failure, or default to the confirmed-safe `flowchart`/table combination until someone verifies live GitHub rendering?
