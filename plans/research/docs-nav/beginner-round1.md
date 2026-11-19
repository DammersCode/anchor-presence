# Docs navigation, beginner reader, round 1

Reader: knows React, has never used a presence or live-cursor library. Scope: `apps/docs/content/docs/**` (six `meta.json` files plus the backends one, every index page, and 20 sampled pages across Get started, Core, DOM, React, Examples, Backends, and Skills). `examples/stable-layout` was ignored, as briefed.

Click convention: `/docs` redirects to Introduction (`apps/docs/next.config.mjs`), so the docs root costs 0 clicks. Every section folder has `"root": true`, so only the Get started tree shows at the root. A switch to another section costs 2 clicks (open the section switcher, pick the section). A sidebar link or an in-page link or card costs 1 click. A scroll costs 0.

## Scores

| Dimension      | Score | Short reason                                                                        |
| -------------- | ----- | ----------------------------------------------------------------------------------- |
| Sidebar        | 7.5   | Section order follows the package layers, not the beginner's path.                  |
| Findability    | 7.5   | "mobile" finds nothing. Multi-user testing lives only under Core.                   |
| Page structure | 8.5   | Openings are strong. Some index headings do not match the sidebar groups.           |
| Placement      | 7.5   | Recipes and Backends sit in the wrong sections. A Concepts page holds how-to steps. |
| Wayfinding     | 8.5   | Every page has Related cards, but a few key cross-links are missing.                |
| Path fit       | 8     | Beginner half only: the first cursor is fast, the step after it has no next card.   |
| Consistency    | 8     | Four names for the relay section. One icon covers four meanings.                    |

Mean: 55.5 / 7 = 7.9.

## Evidence for each score below 9

**Sidebar 7.5**

- `meta.json` orders the sections `get-started, core, dom, react, examples, skills`. A React beginner needs Examples and React next. Core and DOM come first, but those pages are for tests, servers, and adapters (`core/index.mdx`, `dom/index.mdx` say so in their first paragraph).
- `get-started/meta.json` holds 22 pages in 4 groups. The Guides group mixes beginner pages (Layout design, Troubleshooting) with operations pages (Security, Deploy a relay, Performance).
- The sidebar title "Layout design for presence" does not tell a beginner that the page is the fix for jumping cursors.

**Findability 7.5**

- No page in the docs contains "mobile" or "phone" as a reader term. The only "phone" hit is in `skills/layout-audit.mdx`. A search for the beginner's own word finds nothing.
- Touch behavior (pinch clears the cursor, `touch-action: none`) is only in `dom/pointer-capture.mdx#touch-behavior`. No Get started page links to that section.
- `createInMemoryRoom` ("Test with more than two peers") is only in `core/in-memory-transport.mdx`. No Get started page links there. `get-started/guides/troubleshooting.mdx#tests-in-jsdom` talks about tests and links nothing. `examples/backends/index.mdx#no-server` names `createInMemoryPair` with no link.
- The positive side: Quick start is 1 click from the root, and "jump" finds Troubleshooting and Layout design.

**Page structure 8.5**

- `react/index.mdx` sections are "Set up / Render cursors / Read and send presence". The sidebar groups in `react/meta.json` are "Setup / Rendering / Hooks".
- `examples/index.mdx` has a "Recipes" section that the Examples sidebar does not have.
- Example pages put extra sections between Code and Behavior notes ("Show who is on a card" in `kanban.mdx`, "Announce joins and leaves" in `presence-list.mdx`). The template order is otherwise stable.

**Placement 7.5**

- The six recipes (`get-started/guides/cursor-chat.mdx` and others) live under Get started > Recipes. Their live demos and the "Use this when" cards also appear in `examples/index.mdx#recipes`. That gives one set of pages two homes, and a beginner who browses Examples does not see them in its sidebar.
- Backends (relays, relay contract, conformance suite) live in the Examples section under the separator "Servers". A beginner who wants a server does not look under Examples.
- `get-started/concepts/ui-context.mdx` is a Concepts page, but "Set the context" and "Share typing and away" are how-to steps.
- One fact has three homes: "two tabs in one window never show each other a cursor" is in `quick-start.mdx`, `guides/troubleshooting.mdx#cursor-not-visible`, and `dom/pointer-capture.mdx#when-the-cursor-clears`.

**Wayfinding 8.5**

- `quick-start.mdx` ends with six equal Related cards. Nothing says which one to read next, so the beginner has no clear second step.
- `concepts/responsive-layouts.mdx` links Layout design but not `troubleshooting#cursor-jumps-between-two-elements` or the Responsive grid example.
- `kanban.mdx` links the word "tour" back to `/docs/examples`, the overview the reader came from (a loop).
- `core/index.mdx` Related cards have no description text. All other index pages describe each card.

**Path fit 8 (beginner half)**

- Intro, Installation, and Quick start form a short and clear first run.
- After the first cursor, the path to "my layout holds on a second screen" is not marked. The beginner must guess between Concepts > Responsive layouts and Guides > Layout design.
- The relay step of Quick start needs a clone of the repository. Nothing tells the beginner how to open the app on a phone (for example, start Vite with `--host`), so the "two devices" promise has no steps.

**Consistency 8**

- One section has four names: separator "Servers" (`examples/meta.json`), folder "Backends" (`backends/meta.json`), page title "Pick a relay" (`backends/index.mdx`), and "relay" in the prose.
- The `book-open` icon marks the Introduction page, the Guides separator, all three "API reference" separators, and some Related cards (for example "Fallback chain" in `dom/pointer-capture.mdx`, which uses `Waypoints` elsewhere).
- Card titles differ from page titles: "Layout design" vs "Layout design for presence".
- "Remote presence" is the title of two pages (`core/remote-presence.mdx`, `react/remote-presence.mdx`), so search returns two equal hits.

## Task walks

**Task 1: show my first remote cursor.**
Root (Introduction), then Quick start in the sidebar or the card: 1 click. Quick start sends the reader to Installation first: +1 click, and the Related card brings the reader back: +1 click. Total: 1 click (3 with the install detour). The two-window sample works with no server. No dead end. Best walk on the site.

**Task 2: make cursors not jump on mobile.**

- Search "mobile": 0 results. Dead end.
- Sidebar route A: Concepts > Responsive layouts (1). It says "You need no code for this." The Related card Layout design (2) holds the real rules.
- Sidebar route B: Guides > Troubleshooting (1), scroll to "Cursor jumps between two elements", link to Layout design (2).
- Touch part: switcher to DOM (2), Pointer capture (3), scroll to "Touch behavior". No link from Get started. A beginner would not find it.
- A third meaning of "jump" (no easing between messages) is in DOM > Motion (3). Troubleshooting does not mention it.
- Result: 2 clicks to the layout answer, 3 clicks and no signpost for the touch answer.

**Task 3: test with several users.**
Manual reading (the likely beginner reading): Quick start (1) shows two windows. Nothing says that a third window adds a third user, or how to open the app on a phone. Dead end after 1 click.
Automated reading: switcher to Core (2), Transports > In-memory transport (3), scroll to "Test with more than two peers". A search for "test" also finds it. From Get started, the "Tests in jsdom" section has no link, so that route is a dead end.

## Ranked fixes

1. `apps/docs/content/docs/meta.json`: reorder `pages` to `get-started, examples, react, dom, core, skills`. The beginner path then reads top down. Experts still reach Core in one switch.
2. `get-started/quick-start.mdx`: add a short section "Test with more users" after "Connect a relay". Say that each extra window is one more user. Say how to reach the dev server from a phone (Vite `--host`, same network). Link `core/in-memory-transport#test-with-more-than-two-peers` for automated tests.
3. `get-started/guides/troubleshooting.mdx`: in "Tests in jsdom", link `core/in-memory-transport` and its "Test with more than two peers" section. In "Cursor jumps between two elements", add one line for touch screens with a link to `dom/pointer-capture#touch-behavior`, and one line for jumps between messages with a link to `dom/motion`.
4. `get-started/guides/layout-design.mdx`: add "narrow and mobile screens" to the `description` and the first paragraph, so a search for "mobile" lands here. Consider the title "Prevent cursor jumps" and the same title on every card that links it.
5. `get-started/quick-start.mdx` Related: put one "Next" card first (Layout design or Responsive grid), then the rest. The beginner then has one clear second step.
6. `examples/meta.json` and `examples/backends/index.mdx`: use one name. Rename the separator "Servers" to "Backends", and the page title "Pick a relay" to "Backends" (keep "Pick a relay" as a heading).
7. Recipes: pick one home. Either move the six recipe pages to `examples/recipes/` (with redirects in `next.config.mjs`) and drop the Recipes group from `get-started/meta.json`, or keep them in Get started and remove the "Recipes" section from `examples/index.mdx`.
8. `get-started/concepts/responsive-layouts.mdx` Related: add cards for `troubleshooting#cursor-jumps-between-two-elements` and `examples/responsive-grid`.
9. `examples/backends/index.mdx` "No server": link `createInMemoryPair` to `core/in-memory-transport` and `createBroadcastChannelTransport` to `dom/broadcast-channel-transport`.
10. `get-started/concepts/ui-context.mdx`: move "Set the context" and "Share typing and away" to `react/local-context.mdx` or the Typing and away recipe. Keep one link in their place.
11. `react/index.mdx`: rename the sections to match `react/meta.json` ("Setup", "Rendering", "Hooks"), or rename the separators to match the page.
12. `get-started/meta.json` and the API reference separators in `core/`, `dom/`, `react/meta.json`: give Guides and API reference their own icons, different from the Introduction icon.
13. `core/index.mdx` Related: add one-line descriptions to both cards.
14. `examples/kanban.mdx` Behavior notes: drop the link on "tour", or point it at the tour note on `examples/index.mdx`.
15. Two-tabs fact: keep the full text in `dom/pointer-capture.mdx#when-the-cursor-clears` and `quick-start.mdx`. In `troubleshooting.mdx` cut it to the symptom plus the existing link.
