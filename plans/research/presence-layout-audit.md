# Research: a presence layout audit — docs page and agent skill

Status: research note, not a spec. No code changed by this document.

## Executive summary

Anchor Presence already documents the core failure mode: a pointer crossing a gap between anchors falls back to viewport, and viewport position maps to a different spot when layouts differ (`troubleshooting.mdx`, "Cursor jumps between two elements"). This note proposes a way to quantify that risk before a user hits it, a way to measure it (static and dynamic), a shape for shipping an audit skill, a fix catalogue mapped to the resolver's actual fallback order, and a docs page outline. Seven candidate metrics are evaluated against the resolver code; five combine into a proposed 0–100 "jump risk" score, styled after Cumulative Layout Shift (impact × distance) and Lighthouse (weighted, log-normal-curved sub-scores), with a worked example using the repo's own `table-and-cards` and `responsive-grid` demo scenes. Packaging recommendation: a new, separate, user-invoked skill (not a mode of the shipped `anchor-presence` skill), framework-agnostic at its measurement core with an optional React/Playwright driver. Open questions for the owner are listed at the end — mainly weight tuning, CI gating, and the minimum viewport list.

---

## 1. Metrics — quantifying jump risk between two layouts

### Sources

- Resolver order and fallback: `packages/dom/src/resolver.ts:61-159` (`findResolvableAnchor`, `resolveGeometry`) — walks the chain most-specific-first, uses first connected anchor with `width > 0 && height > 0`, else viewport, else hidden.
- Chain construction and cap: `packages/dom/src/pointer.ts:30-56` (`buildCursorPosition`) — chain is `registry.ancestors(target).slice(0, maxAnchors)`, `maxAnchors` default 4 (`packages/dom/src/binding.ts:52`, `:122-128`), protocol cap 8.
- u/v formula: `packages/dom/src/pointer.ts:46-47` (sender) and `packages/dom/src/resolver.ts:115-118` (receiver) — both `(coord - rect.origin) / rect.size`.
- `apps/docs/content/docs/get-started/guides/troubleshooting.mdx:44-48`, "Cursor jumps between two elements" — the one documented jump root cause: gap with no anchored parent → viewport fallback → different landing spot on a differently-arranged receiver.
- `apps/docs/content/docs/get-started/concepts/responsive-layouts.mdx` — worked pixel example of size difference resolving correctly (75% stays 75%); documents that this case is *not* jump risk.
- CLS formula: web.dev, `layout shift score = impact fraction × distance fraction` (impact = unstable-element visible area / viewport area; distance = max shift distance / largest viewport dimension). Thresholds: good ≤ 0.1, needs improvement 0.1–0.25, poor > 0.25.
- Lighthouse scoring: developer.chrome.com, performance score = weighted average of per-metric scores; each metric score comes from a log-normal curve fit to HTTP Archive data, with two control points (25th percentile → score 50, 8th percentile → score 90); near-linear between score 0.50 and 0.92, diminishing returns above 0.96.

### Findings, metric by metric (verified against resolver/binding behavior)

| # | Candidate | Does the resolver actually produce this failure? | Verdict |
|---|---|---|---|
| a | Displacement of an anchor's normalized viewport position between layouts | Yes — `resolveGeometry` computes `x = rect.left + rect.width*u`; if the anchor's rect origin/size differs a lot between layout A and B, the *absolute* screen position differs, which is expected and fine as long as the anchor itself is what's compared (per `responsive-layouts.mdx`, size difference alone is not jump risk). Useful only as a sanity signal, not a risk driver by itself. | Keep, low weight |
| b | Neighbor-distance ratio (adjacent anchors A vs B) | Not modeled by the resolver directly, but it approximates what happens when a pointer moves continuously between two anchors and crosses a gap: `pointer.ts` samples the chain per pointermove, so a straight-line pointer path in one layout can pass through a wide gap in another. This is the closest proxy for "does the fallback trigger mid-drag." | Keep, direct proxy for (e) |
| c | Anchor size/aspect-ratio change (u,v amplification) | Directly modeled: the resolver reapplies the *same* u/v to a different `rect.width/height` (`resolver.ts:117-118`). A large aspect-ratio change turns a small sender-side offset into a large receiver-side pixel error even when the anchor itself resolves (tier stays `anchor`, but the point can land far from the semantically same sub-region, e.g. a button icon vs a stretched full-width button). | Keep |
| d | Gap coverage (fraction of an interactive container's area with no anchor or anchored parent) | Directly modeled: `findResolvableAnchor` only helps if some ancestor in the DOM path is a registered anchor. Area with no anchored ancestor at all can only resolve via viewport tier — exactly the jump root cause in `troubleshooting.mdx:44-48`. This is the single best predictor of jump risk. | Keep, highest weight |
| e | Fallback depth (chain position that ultimately resolved) | Directly modeled: `resolver.ts:69-77` iterates `cursor.anchors` in order; depth = index of the winning anchor. Depth 0 = exact match (safest); depth ≥ 1 up to `maxAnchors-1` = degraded (the resolved point can only be as precise as the *parent's* rectangle, per `fallback-chain.mdx`'s "cursor degrades to the next anchor"); depth = chain length (nothing resolved) = viewport tier, worst case for cross-layout drift. | Keep |
| f | Sibling-order changes (reordering) | Not modeled by resolver geometry at all — reordering does not change any individual anchor's own rect, and resolution is per-anchor-ID, not positional. It affects (b) neighbor-distance only, and only if the *visual adjacency* used to justify a "pointer travels between these two" assumption breaks. Real risk, but it is a special case of (b), not a separate resolver-level signal. | Fold into (b), do not weight separately |
| g | Anchors present in one state, absent in another | Directly modeled: `AnchorRegistry.get` returns `null` for anything not currently registered (`registry.ts:59-63`); a conditionally-rendered anchor (`fallbacks.tsx`'s `.refund` column, hidden when `withActions` is false) forces the resolver past that depth. This is the *cause* of high fallback depth (e) in many real apps, so treat it as the diagnostic explanation, not a separate score input — it is what a static scan can find that a single dynamic snapshot might miss (see §2). | Fold into (e)'s "why," surface separately in fix output, not in the score sum |

### Recommendation (own proposal)

Five independent score inputs, not seven: **(1) gap coverage, (2) fallback-depth delta, (3) neighbor-distance ratio, (4) aspect-ratio amplification, (5) anchor-presence parity** (the (g) case, kept as its own input because it is binary/structural and cheap to compute from a static+dynamic diff, unlike (f) which is genuinely just a modifier on (2)). This is an explainable-scoring design choice inspired by CLS's two-factor multiply and Lighthouse's weighted-sum-of-curved-subscores, not a documented external standard — no external prior art scores DOM-anchor jump risk directly.

---

## 2. Measurement — collecting anchor geometry reliably

### Sources

- `.agents/skills/agent-browser/SKILL.md` — a discovery stub; real workflow content is fetched at runtime via `agent-browser skills get core`, so this repo's copy cannot show the full command surface. It confirms: Chrome/Chromium via CDP, accessibility-tree snapshots with `@eN` refs, sessions/state persistence, a `dogfood` specialized skill for exploratory QA. It is a general web-automation tool, not anchor-aware.
- `plans/026-example-previews.md` — shows the demo already runs two layouts side by side in iframes over `BroadcastChannel`, and already reports `tier`/`anchorId` in a receiver status chip. This is a *reference implementation* of dynamic dual-layout measurement, built for humans watching a page, not for an audit script, but its technique (two panes, same anchors, cross-report resolution tier) is directly reusable.
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

### Recommendation (own proposal — no established standard covers this combination)

**Hybrid, dynamic-primary:** static scan first, to build the candidate anchor/route/state inventory cheaply and flag conditional-render and breakpoint-hiding risk; then Playwright to measure real geometry at each (viewport × state) combination the static scan or a fallback default list surfaced. Concretely, for auto-discovering an unfamiliar app's states without a human enumerating them:

- **Routes**: grep the app's router config/file-based routes (Next.js `app/`/`pages/`, React Router `<Route>` elements) for route paths; static, cheap.
- **Toggle-able UI states**: grep for elements with `aria-expanded`, `role="switch"`, `aria-selected`, or a `<button>`/`<input type="checkbox">` adjacent to a `data-anchor` region — these are strong signals of a collapsible/tabbed panel a human would have manually enumerated. Click each candidate once dynamically and diff the anchor set before/after: a real toggle changes which `[data-anchor]` elements are connected.
- **Breakpoints**: do not guess a single "mobile" number — walk the CSS actually shipped (extract `@media (min-width:|max-width:)` values from built CSS, or Tailwind's config breakpoints) and test one viewport width on each side of every discovered breakpoint boundary, plus the repo's own already-documented pair when one exists (`apps/docs/components/examples/*.tsx`'s `layout: "wide" | "narrow"` scenes use exactly two named states, not a continuum — cheapest fallback default when no CSS breakpoint is discoverable).

This auto-discovery approach is this document's own proposal; it is not validated against a real unfamiliar app in this research pass — see Open Questions.

---

## 3. Skill packaging

### Sources

- `C:/Users/dahe/.claude/skills/writing-for-agents/SKILL.md` and `SKILL-MECHANICS.md` — model-invoked vs user-invoked tradeoff (context load vs cognitive load), progressive disclosure (in-file step → in-file reference → disclosed reference), leading words, router skills.
- platform.claude.com Agent Skills doc (fetched) — `SKILL.md` frontmatter requires `name` (≤64 chars, lowercase+hyphens, no "anthropic"/"claude") and `description` (≤1024 chars, states what + when); three-level progressive disclosure (metadata always loaded → SKILL.md body on trigger → bundled files/scripts loaded only when referenced/run); scripts execute via bash with only their *output* entering context, never their source.
- `skills/anchor-presence/SKILL.md` — the shipped skill, model-invoked (`description` present, no `disable-model-invocation`), scoped to "add live cursors, or fix them," with disclosed reference files `anchors.md`, `transports.md`, `troubleshooting.md` loaded by name, not inline.
- `skills-lock.json` (repo root) — six skills declared, `{source, sourceType: "github", skillPath, computedHash}` per skill, `version: 1`; every entry is a *third-party* skill pulled from a GitHub repo, none is the repo-authored `skills/anchor-presence/`, confirming that the lock file tracks only skills.sh-installed skills, not first-party ones the repo ships to others. (The vercel-labs `skills` README itself does not document the lock file's field semantics — WebFetch of `github.com/vercel-labs/skills` returned installation/discovery docs only, no lock-file schema. This repo's own `skills-lock.json` is therefore the primary evidence used above, per the task's fallback instruction.)
- `AGENTS.md:75-85` — repo-local skills for *this* repo's own contributors live in `.agents/skills/`; `skills/anchor-presence/` is explicitly "the skill we ship to users of the library, not a skill for this repo."

### Findings

The audit skill is **not** a fit for the shipped `anchor-presence` skill:
- `anchor-presence`'s description is scoped to *adding* and *fixing* live cursors in one app the agent is actively wiring up — a narrow, model-invoked trigger tuned for integration work. An audit is a distinct workflow (survey many views, run a browser across a matrix, produce a scored report) with a different completion shape (a report, not working code) and different tools (needs Playwright/browser automation; the integration skill needs none).
- Per `SKILL-MECHANICS.md`'s splitting rule: split off a new skill "when you have a distinct leading word that should trigger it on its own." "Audit my layouts for cursor jump risk" is a distinct trigger phrase from "add live cursors" or "cursor lands on the wrong element" (the current skill's triggers) — folding both into one description would blur the trigger and cost every future `anchor-presence` invocation the audit skill's irrelevant context.
- Cramming both into one `SKILL.md` also breaks progressive disclosure: the audit workflow needs Playwright setup, a scoring reference, and a fix catalogue — none of which the plain integration flow ever needs, so bundling would force every integration run to skip past audit-only reference material.

### Recommendation (own proposal)

Ship a **new, separate, model-invoked skill** (own name, e.g. `anchor-presence-layout-audit`, ≤64 chars, lowercase+hyphens per the frontmatter rule above), living beside `skills/anchor-presence/` in the same `skills/` tree (same install channel, same skills.sh distribution path), not inside `.agents/skills/` (that tree is for this repo's own contributors, not for library users, per `AGENTS.md:76-85`).

Proposed file layout, following the shipped skill's own disclosed-reference pattern (`anchors.md`, `transports.md`, `troubleshooting.md` beside `SKILL.md`):

```
skills/anchor-presence-layout-audit/
  SKILL.md              — steps: discover anchors/states → measure → score → report fixes
  scoring.md            — the formula, weights, thresholds (disclosed reference, §4 below)
  discovery.md          — route/state/breakpoint auto-discovery heuristics (disclosed reference)
  scripts/
    measure.mjs         — Playwright script: viewport × state matrix → raw geometry JSON
    score.mjs           — pure function: geometry JSON (two layouts) → score + explanation
```

**Framework-agnostic design**: the *measurement contract* is "given a URL/local dev server and an anchor attribute name, return `{anchorId, rect, chainDepth}[]` per (viewport, state) combination" — this is pure DOM (`querySelectorAll`, `getBoundingClientRect`, `closest`), with zero React/Next.js API surface, so it works against any framework's rendered output. The *state-toggle* step is the only framework-flavored part (finding "the sidebar collapse button" is app-specific, not framework-specific), and it is driven by the discovery heuristics in §2, not by React-specific selectors. The demo app being React is incidental — nothing in `packages/dom` (the layer the audit actually measures against) imports React (`packages/dom/src/*.ts`, confirmed zero React imports across resolver/binding/pointer/registry).

`scripts/measure.mjs` should use Playwright directly (already the repo's dynamic-test tool of record per `AGENTS.md:52`) rather than depending on `agent-browser`: `agent-browser` is optimized for interactive, accessibility-tree-driven exploration by an agent session, not for a scripted, repeatable, CI-friendly geometry sweep across a fixed viewport×state matrix — and it is a separately-installed external CLI (`npm i -g agent-browser`), an extra dependency this skill does not need for a deterministic script.

---

## 4. Fix catalogue — mapped to metrics and verified against the resolver

| Fix | Mechanism verified against code | Metric(s) improved |
|---|---|---|
| Give a container its own anchor (e.g. `data-anchor="nav"` on a sidebar) | `troubleshooting.mdx:48` and `resolver.ts:69-77`: a parent anchor in the chain gives the resolver a fallback target before viewport, so a pointer crossing the gap between two children still resolves to the shared parent's rect instead of a raw viewport ratio. | (1) gap coverage — directly shrinks uncovered area; (5) anchor-presence parity if the container itself is stable across layouts even when children are not |
| Equal item sizes across breakpoints | `resolver.ts:117-118` reapplies the sender's u/v to the receiver's own rect size; when item aspect ratio is preserved, the same u/v lands on the analogous sub-region on both sides. | (4) aspect-ratio amplification — directly targeted; this is the exact mechanism the metric measures |
| Stable ordering (avoid reordering the same items across states) | Resolution is per-anchor-ID (`registry.ts` keys by string ID, not position), so reordering never breaks *exact-anchor* resolution by itself. It only matters for a pointer path crossing between two anchors — reordering changes which anchor is "next to" which. | (3) neighbor-distance ratio only — verified this fix does *not* help gap coverage or fallback depth, contrary to an intuitive assumption that "reordering is bad for anchors" in general |
| Shared anchor IDs across collapsed/expanded variants | `fallback-chain.mdx` and `responsive-layouts.mdx`'s sidebar example: the *same* ID registered in both states means `AnchorRegistry.get(id)` succeeds in both, so the chain never needs to fall back at all for that item. | (5) anchor-presence parity — directly eliminates the gap; (2) fallback-depth delta drops to zero for that anchor |
| Treat icon-only collapsed nav items as square anchors | Not separately modeled by the resolver — this is really an instance of "equal item sizes across breakpoints" (aspect ratio: a labeled nav item is wide/short, an icon-only one is square) restated for the collapsed-sidebar case specifically. | (4) aspect-ratio amplification — same mechanism, same metric; this is a specific application, not a distinct fix category |
| Split a large anchor into child anchors | `pointer.ts:39` chain is `registry.ancestors(target).slice(0, maxAnchors)` — a large anchor with no children inside it means every pointer position over its whole area reports the *same* anchor ID with a u/v spanning the full rect; if the receiver's version of that large region has very different internal proportions (e.g. content reflows inside it), the u/v still linearly maps but can point at a different *sub-element* semantically. Splitting gives the resolver a more specific, better-matched anchor first in the chain. | (3) neighbor-distance ratio (finer-grained anchors reduce the gap a pointer path must cross) and (4) aspect-ratio amplification (smaller anchors are less likely to have wildly different aspect ratios than the page shell they sit in) |
| Do not anchor decorative wrappers | `skills/anchor-presence/anchors.md:22`: "Skip decorative wrappers — a chain of one meaningful parent beats four vague ones." Verified against `pointer.ts:39-49`: every registered ancestor in the chain consumes one of the `maxAnchors` (default 4) slots; a decorative wrapper anchor wastes a chain slot that could hold a more useful semantic parent, and dilutes (2) fallback-depth's meaning (a "depth 1" fallback to a decorative div is not actually safer than depth 2 to a real semantic parent). | (2) fallback-depth delta — keeps the chain's depth numbers meaningful; indirectly (1) gap coverage by freeing chain budget for real anchors |
| Choose breakpoints that preserve proportions | Not a resolver-level mechanism at all — this is a design-time choice upstream of anything the resolver can see. It reduces how often (4) triggers in the first place, by avoiding breakpoints that turn (say) a 3-column grid into 1 column with drastically different card proportions. | Preventive, upstream of (4); cannot be verified in resolver code because it is a choice made before any anchor exists |

All eight example fixes given in the task check out against actual resolver/binding behavior; none required rejecting one as ineffective, but "reordering" and "icon-only square anchors" are shown above to be *narrower* than they first appear (mapped to one metric each, not several).

---

## 5. Docs outline — "Designing layouts for presence"

### Sources

- `apps/docs/content/docs/get-started/meta.json` — the `get-started` tab already holds `concepts/responsive-layouts` and `guides/troubleshooting`; this new page is guidance that sits between the two (more prescriptive than a concept page, more general than one troubleshooting symptom).
- `AGENTS.md:26-39` — docs style: simple-english prose, no first-person, timeless language ("no now/new/currently"), one-paragraph problem statement before sections for example pages, numbered lists only when order matters, `<Callout type="warn">` for condition-then-risk warnings.
- `plans/026-example-previews.md`'s scene table — confirms `responsive-grid` and `table-and-cards` are the two demo scenes purpose-built to show cross-layout anchor behavior, making them the natural "see it live" links from a new guidance page.

### Recommendation (own proposal)

Place it as a **new guide** under `get-started/guides/`, alongside `troubleshooting.mdx` and `performance.mdx`, not under `concepts/` (concepts explain *how the mechanism works*; this page is prescriptive *advice for authors*, matching the guides tab's existing role — `security.mdx`, `performance.mdx`, `troubleshooting.mdx` are all "how to do X well" pages, not mechanism explainers).

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

**Per-anchor-pair inputs**, computed for one anchor ID present in both layout A and layout B (or its resolution outcome when only one side has it):

- `gap_uncovered`: fraction of the interactive container's area (e.g. `nav`, `orders`) with no registered anchor or anchored ancestor, in layout B. Range 0–1.
- `depth_delta`: `|fallback_depth(B) - fallback_depth(A)|`, where `fallback_depth` is the winning chain index (0 = exact, up to `maxAnchors - 1`; a viewport-tier resolution scores `maxAnchors`). Range 0–`maxAnchors`.
- `neighbor_ratio`: for each pair of anchors adjacent in the pointer's likely path (siblings under the same registered parent), `max(dist_A, dist_B) / min(dist_A, dist_B)` using each anchor's own center point; take the worst ratio among sibling pairs. Range 1–∞, clamp display at 10.
- `aspect_amp`: for one anchor present in both layouts, `max(ratio_A, ratio_B) / min(ratio_A, ratio_B)` where `ratio = rect.width / rect.height`. Range 1–∞, clamp display at 10.
- `presence_parity`: 1 if the anchor ID exists and is measurable (per `isMeasurable`, `resolver.ts:57-59`) in both layouts, 0 if missing in one. Binary.

**Sub-scores** (0–100 each, higher = worse risk), each on a capped-linear curve rather than Lighthouse's fitted log-normal (a log-normal fit needs a large real-world corpus per metric, which does not exist yet for this domain — see Open Questions):

```
score(x, good, poor) = clamp(100 * (x - good) / (poor - good), 0, 100)
```

| Sub-score | x | good threshold | poor threshold |
|---|---|---|---|
| Gap | `gap_uncovered` | 0.05 (5% uncovered) | 0.40 (40% uncovered) |
| Depth | `depth_delta` | 0 | `maxAnchors` (default 4) |
| Neighbor | `neighbor_ratio` | 1.2 | 3.0 |
| Aspect | `aspect_amp` | 1.3 | 3.0 |
| Parity | `1 - presence_parity` (0 or 1) | 0 | 1 (i.e., missing = 100 immediately) |

**Combined score**, CLS-style multiply for the two geometric factors that compound (an anchor that is both badly covered *and* has a large neighbor-distance ratio is worse than either alone would suggest), then Lighthouse-style weighted average with the structural factors:

```
geometric = 100 * (Gap/100) * (0.5 + 0.5 * Neighbor/100)   # gap is the primary driver; neighbor amplifies it
combined  = 0.40 * geometric + 0.25 * Depth + 0.20 * Aspect + 0.15 * Parity
risk_0_100 = round(combined)
```

Named weights (own proposal, explicitly not tuned against real user data — see Open Questions): gap coverage 40% (matches §1's finding that it is the direct cause of the one documented jump symptom), fallback-depth 25%, aspect amplification 20%, presence parity 15%. Neighbor-distance is folded into the gap factor as a multiplier rather than weighted separately, because it only matters *given* a gap exists (a large neighbor-distance ratio with full gap coverage is not a jump risk — the resolver never needs the gap).

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

`combined = 0.40*0 + 0.25*0 + 0.20*5.9 + 0.15*0 ≈ 1.2` → **risk ≈ 1/100, low risk band.** This matches the scene's design intent (per `plans/026-example-previews.md`: "cursor on a cell lands on the same field inside the card") — the worked score confirms the demo is a *good* example, not a risky one.

Contrast with `apps/docs/components/examples/fallbacks.tsx`'s `orders.row:1042.refund` anchor: wide layout renders it (`withActions=true`, line 42-52); narrow layout (`layout==="narrow"`) never renders the `<td>` at all (line 42's `withActions` ternary), so `presence_parity = 0` for that anchor in the narrow layout. `Parity` sub-score = 100. Its nearest surviving ancestor is `orders.row:1042` (still present, line 34) — `fallback_depth` goes from 0 (wide, exact button) to 1 (narrow, falls back to the row) → with `maxAnchors=4`, `depth_delta=1` → `Depth` sub-score = `100*1/4 = 25`. The row itself sits inside the anchored `orders` table (line 31) and `shop` container (line 66), so gap coverage stays low (`Gap` sub-score ≈ 0–5, assume 5 for a small margin/padding sliver): `geometric ≈ 100*0.05*(0.5+0.5*Neighbor/100)`; even at a high `Neighbor` sub-score of 60, `geometric ≈ 100*0.05*0.8 = 4`.

`combined = 0.40*4 + 0.25*25 + 0.20*0(no size to compare, anchor absent) + 0.15*100 ≈ 1.6 + 6.25 + 0 + 15 ≈ 22.9` → **risk ≈ 23/100, moderate risk band** — correctly flags this scene as the one purpose-built to demonstrate fallback behavior (`anchors-and-fallbacks` in `apps/docs/content/docs/examples/meta.json`), riskier than `table-and-cards` but not "high," consistent with the fallback chain still landing on a sensible parent rather than viewport.

---

## Open questions for the owner

1. **Weight tuning.** The 40/25/20/15 split and the good/poor thresholds in the score formula are this document's own proposal with no real-usage data behind them (unlike Lighthouse's log-normal curves, which are fitted to HTTP Archive). Should the first shipped version use these as fixed defaults, or ship them as configurable and gather real audit runs before treating any number as authoritative?
2. **CI gating.** Should a failing score block a PR (like a Lighthouse budget), only warn, or only ever run on demand via the skill? The repo's own gate list (`AGENTS.md:45-52`) has no visual/geometry budget today.
3. **Minimum supported viewport list.** §2 proposes deriving breakpoints from shipped CSS; is there a fixed minimum set (e.g. 375/768/1280/1920) the owner wants tested unconditionally regardless of what the CSS scan finds, similar to how Lighthouse fixes its own device emulation profiles?
4. **Neighbor-distance path model.** The proposed `neighbor_ratio` assumes sibling anchors under a shared registered parent approximate a real pointer path. Is there a preferred way to model an actual likely pointer path (e.g. reading order, tab order) instead of raw sibling adjacency, for apps where visual and DOM order diverge?
5. **Score for missing-both-sides anchors.** The current formula treats "anchor exists in A, missing in B" (parity=0) but does not define behavior for an anchor that is a known false-positive from the static scan (e.g. an anchor ID assembled dynamically that the static scanner cannot resolve to a literal). Should the skill require a manual anchor-ID allowlist for such cases, or attempt runtime discovery only?
6. **Distribution channel for the new skill.** Ship `skills/anchor-presence-layout-audit/` in the same repo as a sibling to `skills/anchor-presence/`, or as a fully separate package/repo, given it needs Playwright as a runtime dependency that the integration skill does not?
