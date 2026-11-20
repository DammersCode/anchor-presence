# Docs navigation, beginner reader, round 3

Reader: knows React, has never used a presence or live-cursor library. Scope: `apps/docs/content/docs/**`. I read all 8 `meta.json` files and all 7 index pages (Introduction, Examples, Backends in part, React, DOM, Core, Skills). In full: Quick start, Installation, Layout design, Troubleshooting, UI context, Remote users, Basics, Kanban, Presence list, Stable layout, In-memory transport. In part: Cursor chat, Pointer capture. I grepped the headings of every recipe, concept, and example page, the `icon:` frontmatter of every page, and the Cards that link Layout design, Anchors, UI context, Occlusion and scroll, Core, DOM, and Raw presence. Click rules as in rounds 1 and 2: `/docs` opens Introduction (0 clicks). A sidebar link, card, or in-page link is 1 click. A section switch is 2 clicks.

## Scores

| Dimension      | Score | Short reason                                                                         |
| -------------- | ----- | ------------------------------------------------------------------------------------ |
| Sidebar        | 9     | Guides, Recipes, and Production are split. Examples links to Recipes.                |
| Findability    | 9     | All five tasks take 2 clicks or fewer. "online", "mobile", and "chat" find pages.    |
| Page structure | 8.5   | One example page and one recipe page have a section that their siblings do not have. |
| Placement      | 8.5   | UI context still has a how-to heading. Cursor chat documents a different chat.       |
| Wayfinding     | 9     | No loops, every page has Related cards. One card on the DOM overview misleads.       |
| Path fit       | 9     | First cursor 1 click, layout rules 2 clicks, more users 1 click.                     |
| Consistency    | 8.5   | Section cards use icons by package type. Core and DOM cards have three titles.       |

Mean: 61.5 / 7 = 8.8 (round 1: 7.9, round 2: 8.6).

Why Sidebar stays at 9: the leftovers do not mislead a beginner. "Layout design for presence" sits first in a two-page Guides group. Recipe URLs under `/guides/` show only in the address bar. In `examples/meta.json:24-25`, the separator "Servers" sits over a page titled "Backends", which names the same thing. "Browse recipes" (line 23) opens the first recipe, and the Recipes group then shows in the sidebar. Why Wayfinding stays at 9: the wrong card text (fix 5) sits on the DOM overview, off the beginner path.

## Evidence for each score below 9

**Page structure 8.5**

- `examples/stable-layout.mdx:25` has `## Why it holds` between Code and Behavior notes. The other 10 front-end example pages have only Code, Behavior notes, and Related. Round 2 fixed the same problem in `kanban.mdx` and `presence-list.mdx`.
- `guides/cursor-chat.mdx:222` has `## Run the full demo app` after Behavior notes. No other recipe has a section there.
- To reach 9: fix both pages, so every example page and every recipe ends with Behavior notes and Related.

**Placement 8.5**

- `concepts/ui-context.mdx:61`: `## Share typing and away` is a heading over two sentences and a link, a how-to pointer on a Concepts page. Line 13 already links the same recipe.
- `guides/cursor-chat.mdx:222-233` describes the chat of the demo app, which "is not this recipe". A beginner sees two chats with different timeouts (5 s and 3 s) on one page.
- Backends still sit in the Examples section. The Introduction card "Backends" makes them easy to find, so I count this as minor.
- To reach 9: delete the UI context heading and move the demo-app section out of the recipe.

**Consistency 8.5**

- Fixed: Layout design, Anchors, UI context, and Occlusion and scroll each have one card title and one icon on every page that links them.
- `/docs/core` has three card titles: "Core" (`dom/index.mdx:114`), "Core overview" (`react/index.mdx:128`), and "@anchor-presence/core" (`introduction.mdx:77`). `/docs/dom` has "DOM overview" and "@anchor-presence/dom" in the same way.
- Section cards use an icon by package type, not the frontmatter icon of the target page. `BookOpen` marks Get started sections (`anchors-and-fallbacks.mdx:52,59`, `responsive-grid.mdx:48`, `table-and-cards.mdx:47,51`, `dialogs-and-layers.mdx:41`). `Cpu` marks core sections (`presence-list.mdx:58,61`, `interpolation-styles.mdx:46`). `Atom` marks React sections (`presence-list.mdx:67`, `custom-cursor-rendering.mdx:51`, `dialogs-and-layers.mdx:54`). `AppWindow`, the icon of the BroadcastChannel pages, marks DOM sections (`basics.mdx:52`, `kanban.mdx:47`, `anchors-and-fallbacks.mdx:65,69`). `LayoutGrid`, the Responsive grid icon, marks "Normalized u/v coordinates" (`responsive-grid.mdx:62`).
- The inline link text "layout design guide" (`basics.mdx:15`, `presence-list.mdx:15`, `stable-layout.mdx:40`) differs from the page title. This is minor.
- To reach 9: give every card its target page's frontmatter icon, and use one title for the Core and DOM overviews.

## Task walks

**Task 1: show my first remote cursor.** Introduction card Quick start (1). The page names the Vite create command and gives a full `App.tsx` with no server. Install detour: Installation (+1), its Related card Quick start (+1). Total 1 click, or 3 with the detour. No dead end.

**Task 2: cursors must not jump on mobile.** Quick start (1), Related card "Next: Layout design for presence" (2). Or the sidebar Guides > Layout design (1). A search for "mobile" finds Layout design through its description. Touch: Troubleshooting (1) > "Cursor not visible" > "A second finger starts a pinch" > Touch behavior (2). Weak spot: Layout design has no link to touch rules or Troubleshooting, so from Layout design the pinch fact costs 2 more clicks (4 in total).

**Task 3: test with several users.** Quick start (1), "Test with more users": one window is one user, `bun run dev --host` for a phone, and a phone needs the relay. No browser: the link to `core/in-memory-transport#test-with-more-than-two-peers` (2), which has a three-client `createInMemoryRoom` sample. Troubleshooting "Tests in jsdom" links there too. Weak spot: the page says the pair works "to try the provider and the hooks" (line 9), but it has no React sample and no link to `react/client-creation`. A beginner gets core code only. No dead end.

**Task 4 (new): show who is online.** Introduction > More sections > Examples (1) > Presence list (2). Its "Remote users" card (3) gives the hook. Sidebar: switch to React (2) > Hooks > Remote users (3). Search: "online" now finds `react/remote-users`, `examples/presence-list`, and `examples/index`. Get started has no entry for this task. Total 2 clicks to working code.

**Task 5 (new): add a cursor chat.** Sidebar Get started > Recipes > Cursor chat (1). Search "chat" also finds it. From Examples: "Browse recipes" switches to Get started and opens Cursor chat (3). The page has a demo, one file in three parts, and Behavior notes. Confusion point: the last section runs a different chat. Total 1 click.

## Round-2 findings: are they fixed?

| #   | Round-2 finding                     | Verdict  | Evidence                                                                                   |
| --- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| 1   | One title and icon per target page  | Partial  | Four target pages fixed; section-card icons and Core/DOM titles remain                     |
| 2   | DOM index Core card icon `Box`      | Fixed    | `dom/index.mdx:114`                                                                        |
| 3   | React "Raw presence" title          | Fixed    | `react/remote-presence.mdx:2`, `react/index.mdx:98`                                        |
| 4   | Split Guides, add Production        | Fixed    | `get-started/meta.json:17-30`                                                              |
| 5   | Recipes entry in Examples sidebar   | Fixed    | `examples/meta.json:22-23`                                                                 |
| 6   | Stable layout card, section order   | Fixed    | `examples/index.mdx:47`; `kanban.mdx:34`; `presence-list.mdx:53`; `typing-and-away.mdx:93` |
| 7   | UI context how-to steps             | Partial  | Renamed "Where context comes from", sample gone; line 61 heading remains                   |
| 8   | Pinch under "Cursor not visible"    | Fixed    | `troubleshooting.mdx:55`                                                                   |
| 9   | Layout design touch link (optional) | Not done | `layout-design.mdx:125-140` has no Troubleshooting or touch card                           |
| 10  | "who is online" in Remote users     | Fixed    | `react/remote-users.mdx:3`                                                                 |
| 11  | Rename Layout design (optional)     | Not done | `layout-design.mdx:2`                                                                      |
| -   | Recipe URLs under `/guides/`        | Not done | `get-started/meta.json:21-26`; no ranked fix in round 2                                    |
| -   | Backends in the Examples section    | Not done | `examples/meta.json:25`; accepted, see Placement                                           |

## Ranked fixes

Items 1 to 4 are must-fix: each holds a dimension under 9. Items 5 to 8 are optional.

1. `examples/stable-layout.mdx:25` (Page structure): fold the four "Why it holds" bullets into Behavior notes, and delete the heading.
2. `guides/cursor-chat.mdx:222-233` (Page structure, Placement): delete "Run the full demo app". Link the demo README from a Related card instead.
3. `concepts/ui-context.mdx:61-63` (Placement): delete `## Share typing and away`. Line 13 already links the recipe.
4. Cards (Consistency): each card uses the frontmatter `icon:` of its target page, also for a section link. Files: `anchors-and-fallbacks`, `responsive-grid`, `table-and-cards`, `dialogs-and-layers`, `presence-list`, `interpolation-styles`, `custom-cursor-rendering`, `occlusion-and-scroll-containers`, `kanban`, `stable-layout`, `basics`. Then title the Core and DOM overview cards "Core overview" and "DOM overview" in `dom/index.mdx:114` and `introduction.mdx:77,80`, or use the package names everywhere.
5. `dom/index.mdx:117-118` (Wayfinding): the Introduction card says "Install the packages and show the first remote cursor", but Introduction does neither. Make it a Quick start card (`Rocket`).
6. `core/in-memory-transport.mdx` Related: add a card to `react/client-creation`, and one line on passing a room client to `PresenceProvider`.
7. `guides/layout-design.mdx` Related: add a Troubleshooting card to `#cursor-jumps-between-two-elements`, and one sentence on touch screens that links `dom/pointer-capture#touch-behavior`.
8. `get-started/meta.json` Recipes: add `"[Presence list](/docs/examples/presence-list)"`, as `core/meta.json:18` does for Relay contract, so "who is online" shows in Get started.

Side note: page frontmatter icons repeat (`zap` for Events, Remote events, and Bun; `users` for four pages; `eye` for UI context and Visibility policy). Fix 4 therefore makes cards match their targets, not make every icon unique.

Not checked: the rendered site, the site search index, and `format:check` for this file.
