# Docs navigation, beginner reader, round 2

Reader: knows React, has never used a presence or live-cursor library. Scope: `apps/docs/content/docs/**`. I read all 8 `meta.json` files and every index page. I also read 20 other pages: Quick start, Installation, Frameworks, Responsive layouts, UI context, Layout design, Troubleshooting, Deploy a relay, Cursor chat, Card occupancy, Basics, Kanban, Presence list, Stable layout, In-memory transport, Pointer capture, Motion, Connection status, plus the headings of Bun and Layout audit. Click convention as in round 1: `/docs` redirects to Introduction (`apps/docs/next.config.mjs:25`), so it costs 0 clicks. A section switch costs 2 clicks. A sidebar link, card, or in-page link costs 1 click. Search was checked with grep, not with the site search.

## Scores

| Dimension      | Score | Short reason                                                                         |
| -------------- | ----- | ------------------------------------------------------------------------------------ |
| Sidebar        | 8.5   | Section order is fixed. The Guides group still mixes first-week and ops pages.       |
| Findability    | 9     | All four tasks take 2 clicks or fewer. "mobile" and "phone" now find pages.          |
| Page structure | 8.5   | Example and recipe pages put extra sections in different places.                     |
| Placement      | 8.5   | UI context still holds how-to steps. The touch fact sits under the wrong symptom.    |
| Wayfinding     | 9     | Quick start has a Next card. The round-1 loop and the missing links are fixed.       |
| Path fit       | 9     | First run, first cursor, and first layout are 1 or 2 clicks, with a clear next step. |
| Consistency    | 8     | One page gets up to four card titles and three icons, depending on who links it.     |

Mean: 60.5 / 7 = 8.6 (round 1: 7.9).

## Evidence for each score below 9

**Sidebar 8.5**

- `get-started/meta.json` holds 22 pages. Under Guides, Layout design and Troubleshooting (first week) sit next to Security, Deploy a relay, and Performance (operations). Round 1 flagged this, and the file is unchanged.
- The sidebar title is still "Layout design for presence". A beginner with jumping cursors does not see that this page is the fix. The description now helps search, but the sidebar shows only the title.
- The Recipes group points to files in `guides/`, so the URL says `/guides/cursor-chat` under the "Recipes" heading.

**Page structure 8.5**

- `examples/index.mdx` still has a "## Recipes" heading. The Examples sidebar (`examples/meta.json`) has no Recipes entry, so the page and the sidebar disagree.
- `examples/stable-layout.mdx` is in the Layouts group of the sidebar, and `basics.mdx` and `presence-list.mdx` link to it, but `examples/index.mdx#layouts` has no card for it.
- Example pages put extra sections between Code and Behavior notes: "Show who is on a card" (`kanban.mdx:27`) and "Announce joins and leaves" (`presence-list.mdx:44`). Round 1 flagged this, and it is unchanged.
- Recipe pages have no shared order. `typing-and-away.mdx` puts a content section, "Idle or away" (line 99), after Behavior notes. `card-occupancy.mdx` and `follow-mode.mdx` end with Behavior notes and then Related.

**Placement 8.5**

- `get-started/concepts/ui-context.mdx` still has "## Set the context" with code, and "## Share typing and away", which is a heading over one sentence and a link. Both are how-to steps on a Concepts page.
- `troubleshooting.mdx:83` puts "a second finger starts a pinch, and the cursor clears" under "Cursor jumps between two elements". A cleared cursor is the "Cursor not visible" symptom (line 43), so a reader whose cursor vanishes on a phone looks in the wrong section.
- Backends still live in the Examples section. Round-1 fix 6 renamed the section, but did not move it. The Introduction card "Backends" softens this.

**Consistency 8**

- The Layout design page has four card titles: "Layout design" (`troubleshooting`, `anchors`, `fallback-chain`, `responsive-layouts`), "Layout design for presence" (`skills/index`, `skills/integration`, `skills/layout-audit`), "Next: keep cursors steady" (`quick-start`), and "layout design guide" (callouts in `basics`, `presence-list`). It also has two icons: `LayoutDashboard`, and `Ruler` on the three skills pages.
- The Anchors page has `Anchor` in `introduction`, `quick-start`, `how-it-works`, and `fallback-chain`, but `BookOpen` in `basics.mdx:48` and `anchor-registration.mdx:61`. The example pages use `BookOpen` for any concept page, `Cpu` for any core page, and `Atom` for any React page. The other pages use one icon per target page. That gives the site two icon schemes.
- UI context has `Eye` in `troubleshooting` and `Compass` in `card-occupancy` and `typing-and-away`. `Compass` is also the icon of the Get started section. Occlusion and scroll has `Layers` (`dom/index`), `ScanEye` (`ui-context`), and `Eye` (`kanban`).
- `dom/index.mdx:97`: the "Core" card uses `Code`, the API-reference icon. Everywhere else, Core is `Box`.
- Two pages are still titled "Remote presence" (`core/remote-presence.mdx`, `react/remote-presence.mdx`).

## Task walks

**Task 1: show my first remote cursor.** Root, then Quick start (1). Quick start sends the reader to Installation (+1), and its first Related card returns to Quick start (+1). Total: 1 click, or 3 with the install detour. The sample works with no server, and the page names the Vite create command. No dead end.

**Task 2: make cursors not jump on mobile.** A search for "mobile" finds Layout design (description and first paragraph), and "phone" finds Quick start. From the sidebar: Quick start (1), then the Next card "keep cursors steady" (2). For touch: Guides > Troubleshooting (1), "Cursor jumps between two elements", then the Touch behavior link (2). A link to Motion covers jumps between messages (2). Total: 2 clicks for each meaning of "jump". One weak spot: Layout design has no link to the touch rules or to Troubleshooting, so a reader who starts there reaches the pinch fact only through search.

**Task 3: test with several users.** Quick start (1), then scroll to "Test with more users". It says that each window is one user, how to open the app on a phone (`bun run dev --host`), and that a phone needs the relay. The automated route is a link to `core/in-memory-transport#test-with-more-than-two-peers` (2). Troubleshooting "Tests in jsdom" links to the same place. Total: 1 click manual, 2 clicks automated. No dead end.

**Task 4 (new): show a "who is online" list.** Introduction > More sections > Examples (1) > Presence list card (2). The `useRemoteUsers` card on that page takes 3 clicks. With the sidebar: switch to React (2) > Remote users (3). A search for "online" finds `examples/presence-list` and `examples/index`, but not `react/remote-users`, which says "presence list" instead. Get started has no entry for this task, except the Join and leave announcer recipe. Total: 2 clicks to code that works. No dead end.

## Round-1 findings: are they fixed?

| #   | Round-1 fix                                  | Verdict | Evidence                                                                           |
| --- | -------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| 1   | Reorder sections                             | Fixed   | `meta.json`: get-started, examples, react, dom, core, skills                       |
| 2   | Quick start "Test with more users"           | Fixed   | `quick-start.mdx:110-112`                                                          |
| 3   | Troubleshooting links (tests, touch, motion) | Fixed   | `troubleshooting.mdx:83`, `:99`; the touch line sits under the wrong symptom       |
| 4   | Layout design "mobile", one card title       | Partial | Description fixed; title unchanged; four card titles                               |
| 5   | Quick start Next card                        | Fixed   | `quick-start.mdx:121-127`                                                          |
| 6   | One name for Backends                        | Fixed   | Separator, folder, and title all say "Backends"; the section is not moved          |
| 7   | Recipes: one home                            | Partial | One pointer card, no duplicated demos; the "Recipes" heading is not in the sidebar |
| 8   | Responsive layouts Related                   | Fixed   | `responsive-layouts.mdx:53-62`                                                     |
| 9   | Backends "No server" links                   | Fixed   | `backends/index.mdx:67-68`                                                         |
| 10  | UI context how-to steps                      | Partial | Shorter, but both how-to headings remain                                           |
| 11  | React index headings match the sidebar       | Fixed   | Setup / Rendering / Hooks                                                          |
| 12  | Separate icons for Guides and API            | Partial | Separators fixed (`book-marked`, `braces`); card icons still mixed                 |
| 13  | Core index card descriptions                 | Fixed   | `core/index.mdx:86-93`                                                             |
| 14  | Kanban "tour" loop                           | Fixed   | The link is gone                                                                   |
| 15  | Two-tabs fact cut in Troubleshooting         | Fixed   | `troubleshooting.mdx:47`: the symptom plus a link                                  |

## Ranked fixes

Must-fix means the fix holds a dimension under 9. Items 1 to 8 are must-fix. Items 9 to 11 are optional.

1. Card titles and icons (Consistency): give every card to one page the same title and icon. Layout design: "Layout design" with `LayoutDashboard`, in `skills/index.mdx`, `skills/integration.mdx`, `skills/layout-audit.mdx`, and `quick-start.mdx` (keep "Next:" only as a prefix). Anchors: `Anchor` in `examples/basics.mdx` and `dom/anchor-registration.mdx`. UI context: `Eye` in `card-occupancy.mdx` and `typing-and-away.mdx`. Occlusion and scroll: one icon in `dom/index`, `ui-context`, and `kanban`. Then drop the type-based `BookOpen`/`Cpu`/`Atom` scheme from the example Related cards.
2. `dom/index.mdx:97` (Consistency): change the "Core" card icon from `Code` to `Box`.
3. `react/remote-presence.mdx` (Consistency): give it its own title, for example "Raw presence", and use the same title in its `react/index.mdx` card.
4. `get-started/meta.json` (Sidebar): split Guides. Keep Layout design and Troubleshooting under Guides. Move Security, Deploy a relay, and Performance under a new separator, for example `---[server-cog]Production---`, after Recipes.
5. `examples/meta.json` (Page structure): add a link entry `"[Recipes](/docs/get-started/guides/cursor-chat)"` before Backends, as `core/meta.json` does for Relay contract. The sidebar then matches the `## Recipes` heading of the overview.
6. `examples/index.mdx#layouts` (Page structure): add a Stable layout card. In `kanban.mdx` and `presence-list.mdx`, move the recipe pointer section to the line before `## Related`, the same place on both pages. In `typing-and-away.mdx`, move "Idle or away" above Behavior notes.
7. `get-started/concepts/ui-context.mdx` (Placement): delete the heading "Share typing and away" and fold its sentence into the end of "Set the context". Then rename "Set the context" to "Where the context comes from" and keep it to the two links, without the `setContext` sample, which belongs in `react/local-context.mdx` or `core/presence-client.mdx`.
8. `troubleshooting.mdx` (Placement): move the pinch sentence from "Cursor jumps between two elements" to "Cursor not visible" as a fifth cause, "A second finger started a pinch". In "Cursor jumps", keep only the Motion line.
9. `layout-design.mdx` Related (optional): add a Troubleshooting card that links `#cursor-jumps-between-two-elements`, and one line on touch screens with a link to `dom/pointer-capture#touch-behavior`.
10. `react/remote-users.mdx` (optional): add "who is online" to the description, so that search for the beginner's own words finds the hook.
11. Sidebar title of `layout-design.mdx` (optional): "Prevent cursor jumps" says the use case. If you rename it, change all the card titles from fix 1 to match.

Not checked: the rendered site, the site search index, and `format:check` for this file.
