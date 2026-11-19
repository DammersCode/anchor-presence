# Docs navigation, beginner reader, round 4

Reader: knows React, has never used a presence or live-cursor library. Scope: `apps/docs/content/docs/**`. I read 6 of the 8 `meta.json` files (root, Get started, Examples, React, DOM, Core; not Skills and Backends) and the index pages of Introduction, Examples, React, DOM, Core (top), and Skills. In full: Quick start, UI context, In-memory transport, Dialogs and layers, Custom cursors (React). In part: Installation, Layout design, Troubleshooting, Pointer capture, Custom cursor rendering. I grepped every `## ` heading under Get started and Examples, every `icon:` frontmatter, every Card icon on example pages, every card that links `/docs/core`, `/docs/dom`, `/docs/react`, and every inbound link to each example page. Click rules as in rounds 1 to 3: `/docs` opens Introduction (0 clicks). A sidebar link, card, or in-page link is 1 click. A section switch is 2 clicks.

## Scores

| Dimension      | Score | Short reason                                                                                  |
| -------------- | ----- | --------------------------------------------------------------------------------------------- |
| Sidebar        | 9     | No change since round 3. Groups follow the path. Small leftovers only.                        |
| Findability    | 9     | All five tasks take 2 clicks or fewer from the root. "dialog", "mobile", "custom cursor" hit. |
| Page structure | 9     | Every example ends Code, Behavior notes, Related. Every recipe ends Behavior notes, Related.  |
| Placement      | 9     | The UI context how-to heading and the second chat in Cursor chat are gone.                    |
| Wayfinding     | 8.5   | The Dialogs and layers demo has one inbound link. The DOM overview card still misleads.       |
| Path fit       | 9     | First cursor 1 click, layout rules 1 to 2 clicks, more users 1 click.                         |
| Consistency    | 9     | Card icons match their target pages. Core, DOM, React overview cards have one title each.     |

Mean: 62.5 / 7 = 8.9 (round 1: 7.9, round 2: 8.6, round 3: 8.8).

Why Sidebar stays at 9: the leftovers do not mislead. Recipe URLs sit under `/guides/` (`get-started/meta.json:21-26`). The separator "Servers" sits over "Backends" (`examples/meta.json:24-25`). Get started holds 23 entries, but the four separators make it scannable. Why Consistency is 9: frontmatter icons repeat across unrelated pages (`server` for SSR and Strict Mode and Backends, `eye-off` for Typing and away and the occlusion example, `kanban` for Card occupancy and Kanban board), but each card now shows the icon of its target, so a beginner never sees two icons for one page. The inline text "layout design guide" (`examples/stable-layout.mdx:35`, `examples/custom-cursor-rendering.mdx:15-16`) still differs from the page title; this is minor.

## Evidence for the score below 9

**Wayfinding 8.5**

- `examples/dialogs-and-layers.mdx` has exactly one inbound link: `examples/index.mdx:65`. No other example page links it either. The pages that explain the same problem never link the live demo: `get-started/concepts/ui-context.mdx:41-59` ("Dialog mismatch handling", Related at 67-82), `dom/visibility-policy.mdx:62-92` (dialog policy sample), and `react/cursor-layer.mdx:100` ("Dialogs and transforms"). Most examples have an inbound link from a concept or reference page (`dom/motion.mdx:42`, `dom/occlusion-and-scroll.mdx:62`, `react/remote-users.mdx:34`, `layout-design.mdx:26,67,90,105`).
- `dom/index.mdx:117-118`: the Introduction card says "Install the packages and show the first remote cursor". Introduction does neither. Round-3 fix 5, not done.
- `react/custom-cursors.mdx:116-128`: Related has no card to `examples/custom-cursor-rendering`, which links back to it twice. The React page embeds the same preview, so this is minor.
- To reach 9: add a `Layers` card "Dialogs and layers" to the Related of `concepts/ui-context.mdx` and `dom/visibility-policy.mdx`. In `dom/index.mdx:117-118`, replace the Introduction card with a `Rocket` "Quick start" card.

## Task walks

**Task 1: show my first remote cursor.** Introduction card Quick start (1). Full `App.tsx`, the Vite create command, no server. Install detour: Installation (+1), Related Quick start (+1). Total 1 click, 3 with the detour. No dead end.

**Task 2: cursors must not jump on mobile.** Sidebar Guides > Layout design for presence (1). Its description names "mobile screen", so a search for "mobile" finds it. Or Quick start (1) > "Next: Layout design for presence" (2). Touch: the new Related card "Touch behavior" (`layout-design.mdx:140`) reaches the pinch rule in 1 more click (round 3: 2). Troubleshooting "Cursor jumps between two elements" links back to Layout design. No dead end.

**Task 3: test with several users.** Quick start (1) > "Test with more users": one window per user, `bun run dev --host` for a phone, a relay for a phone. No browser: link to `core/in-memory-transport#test-with-more-than-two-peers` (2). Weak spot remains: `in-memory-transport.mdx:9` says the pair lets you "try the provider and the hooks", but the page has no React sample and no card to `react/client-creation`. No dead end.

**Task 4 (new): use a custom cursor shape.** Quick start (1) > Related "Custom cursors" (2): `renderCursor`, `DefaultCursor` CSS variables, a touch ring, a live preview. Or Examples (1) > Custom cursor rendering (2) > "renderCursor" card (3). Search "custom cursor" finds both. Weak spot: the React page does not point to the example with the full source. Total 2 clicks.

**Task 5 (new): stop a dialog from confusing remote cursors.** Examples (1) > Dialogs and layers (2): demo, full source, and a card to "Dialog mismatch handling". Search "dialog" finds UI context, Dialogs and layers, and CursorLayer. Sidebar: the entry "UI context" (1) holds the three approaches and a policy sample, but its title does not say "dialog". Dead end: from UI context or Visibility policy, the live demo costs a section switch plus one click (3). Total 2 clicks.

## Round-3 findings: are they fixed?

| #   | Round-3 finding                                 | Verdict  | Evidence                                                                                                      |
| --- | ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Stable layout "Why it holds" heading            | Fixed    | `stable-layout.mdx:13,25,37`: Code, Behavior notes, Related only                                              |
| 2   | Cursor chat "Run the full demo app"             | Fixed    | `cursor-chat.mdx:212,222`: Behavior notes, then Related                                                       |
| 3   | UI context `## Share typing and away`           | Fixed    | Gone; line 13 links the recipe; line 61 is "Never change the receiver UI", a concept rule                     |
| 4   | Card icons by target page; overview titles      | Fixed    | All example-page cards match target `icon:`; "Core overview" at `dom/index.mdx:114`, `introduction.mdx:79-85` |
| 5   | DOM overview Introduction card misleads         | Not done | `dom/index.mdx:117-118`                                                                                       |
| 6   | In-memory transport React link (optional)       | Not done | `in-memory-transport.mdx:59-69` Related has Transports, Custom transport, Backends only                       |
| 7   | Layout design touch and Troubleshooting cards   | Partial  | Touch card at `layout-design.mdx:140`; no Troubleshooting card                                                |
| 8   | Presence list in Get started Recipes (optional) | Not done | `get-started/meta.json:20-26`                                                                                 |

## Ranked fixes

Items 1 and 2 are must-fix: together they hold Wayfinding under 9. Items 3 to 6 are optional.

1. `get-started/concepts/ui-context.mdx` Related and `dom/visibility-policy.mdx` Related (Wayfinding): add a `Layers` card "Dialogs and layers" to `/docs/examples/dialogs-and-layers`, text "The hide rule, live."
2. `dom/index.mdx:117-118` (Wayfinding): replace the Introduction card with `<Card icon={<Rocket />} title="Quick start" href="/docs/get-started/quick-start">`, or keep Introduction and change its text to "What the library does, and the terms of these docs."
3. `react/custom-cursors.mdx` Related: add a `Brush` card "Custom cursor rendering" to the example.
4. `core/in-memory-transport.mdx` Related: add a `Factory` card to `react/client-creation`, and one sentence on passing a room client to `PresenceProvider`.
5. `examples/index.mdx:87`: the card titled "Cursor chat" describes all six recipes. Title it "Recipes".
6. `get-started/meta.json` Recipes: add `"[Presence list](/docs/examples/presence-list)"`, so "who is online" shows in Get started.

Not checked: the rendered site, the site search index, every page in full (about 15 of 95 read), and `format:check` for this file.
