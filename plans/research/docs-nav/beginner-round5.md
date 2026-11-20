# Docs navigation, beginner reader, round 5

Reader: knows React, has never used a presence or live-cursor library. Scope: `apps/docs/content/docs/**`. I read all 8 `meta.json` files and every index page: Introduction, Examples, Backends, React, DOM, Core, and Skills. In full: Quick start, Typing and away, In-memory transport, Dialogs and layers, Presence list. In part: Custom cursors (Idle cursors, Related), Custom cursor rendering. By headings: Layout design, Troubleshooting, Pointer capture, CursorLayer, Visibility policy, Layout audit skill. I grepped every `title:` (89 pages), every `icon:`, every `## Related` (88 pages; only the card index `examples/index.mdx` has none), every `idle` hit, and the inbound links to the round-4 targets. Click rules as in rounds 1 to 4: `/docs` opens Introduction (0 clicks). A sidebar link, card, or in-page link is 1 click. A section switch is 2 clicks.

## Scores

| Dimension      | Score | Short reason                                                                            |
| -------------- | ----- | --------------------------------------------------------------------------------------- |
| Sidebar        | 8.5   | The separator "Backends" sits directly above the folder "Backends". Two rows, one name. |
| Findability    | 9     | All five tasks take 2 clicks or fewer. "typing", "idle", "mobile", "dialog" all hit.    |
| Page structure | 9     | Pages open with what and when. Examples end Code, Behavior notes, Related.              |
| Placement      | 9     | Idle facts sit in core (concept) and Custom cursors (styling). No mixed page types.     |
| Wayfinding     | 8.5   | Both round-4 must-fixes are done, but "hide idle cursors" ends in a soft dead end.      |
| Path fit       | 9     | First cursor 1 click, layout rules 1 click, typing indicator 1 click.                   |
| Consistency    | 9     | Card icons match their targets. Small text leftovers only, as in round 4.               |

Mean: 62 / 7 = 8.9 (round 1: 7.9, round 2: 8.6, round 3: 8.8, round 4: 8.9).

## Evidence for the scores below 9

**Sidebar 8.5.** `examples/meta.json:24-25`: separator `---[server]Backends---`, then the folder `backends`, titled "Backends" (`backends/meta.json:2`). The folder row adds a level and no information. Four more repeats are the lead page of their group: `dom/meta.json:8-9` (Binding), `:12-13` (Resolution), `core/meta.json:14-15` (Transports), `:19-20` (Codecs). A page row is a destination, so these do not mislead; I accept them. Do not rename the separator back to "Servers": round 1 (`beginner-round1.md:57,86`) asked for one name. To reach 9: in `examples/meta.json:25`, replace `"backends"` with `"...backends"`. The installed Fumadocs inlines the folder's index page and children, separators included (`fumadocs-core/dist/dynamic-CSrl9w26.js:436-444`). URLs stay the same. Check the rendered sidebar after the change.

**Wayfinding 8.5.** No page says how to hide an idle cursor. `react/custom-cursors.mdx:106-112` dims and sets `grayscale(1)`. `react/cursor-layer.mdx:73-78` shows `filterCursor` with a `tier` sample and never says "idle". `get-started/guides/typing-and-away.mdx:95-97` says "`CursorLayer` and `useRemoteUsers` already give it" with no link to either React page. To reach 9: fixes 2 and 3 below. `filterCursor` receives a `ResolvedCursor` with `idle: boolean` (`packages/react/src/cursor.tsx:89`, `packages/dom/src/resolver.ts:41`), so the sample compiles.

**Consistency, why it stays 9.** Leftovers: "Client creation" at `react/api/hooks.mdx:80` (title: "Create the client"); "layout design guide" at `examples/stable-layout.mdx:35`, `examples/presence-list.mdx:15-16`, `examples/custom-cursor-rendering.mdx:15-16`. Round 4 held 9 with the same kind of leftover; each link still lands on the right page.

## Task walks

**Task 1: show my first remote cursor.** Introduction card Quick start (1). Full `App.tsx`, the Vite create command, two windows with no server, then a relay. Total 1 click. No dead end.

**Task 2: cursors must not jump on mobile.** Sidebar Guides > Layout design for presence (1). Its description names "mobile screen". Related "Touch behavior" (2) lands on `pointer-capture.mdx:62`. Troubleshooting "Cursor jumps between two elements" (`troubleshooting.mdx:81-87`) links back. Total 1 click. No dead end.

**Task 3: test with several users.** Quick start (1) > "Test with more users": a third window, `bun run dev --host` for a phone, then a relay. No browser: `core/in-memory-transport#test-with-more-than-two-peers` (2). Weak spot, unchanged: `in-memory-transport.mdx:9` says "try the provider and the hooks", but the page has no React sample and no card to `react/client-creation`.

**Task 4 (new): show a typing indicator.** Sidebar Get started > Recipes > Typing and away (1). Full sample with `useStatus`, `CommentBox`, and `TypingHint`, a stop timer, and the away flag. The search "typing" finds it. Total 1 click. No dead end.

**Task 5 (new): hide the cursors of idle users.** React > Custom cursors (2) > "Idle cursors": the attribute and a grayscale sample. Or React > CursorLayer (2) > "Filter cursors": `filterCursor`, no idle sample. Or Typing and away (1) > "Idle or away": the only link goes to core (2), which says "dim". The beginner must combine `filterCursor` with the `idle` field from `remote-cursors.mdx:27`, or guess `display: none`. Total 2 clicks, answer by inference. Soft dead end.

## Earlier findings: are they fixed?

| #   | Finding                                          | Verdict  | Evidence                                                                |
| --- | ------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| 1   | Dialogs and layers card in UI context and policy | Fixed    | `concepts/ui-context.mdx:79`, `dom/visibility-policy.mdx:108`           |
| 2   | DOM overview Introduction card misleads          | Fixed    | `dom/index.mdx:132-134`: Rocket card "Quick start"                      |
| 3   | Custom cursors Related lacks the example         | Not done | `react/custom-cursors.mdx:118-128`: CursorLayer, Remote users, API only |
| 4   | In-memory transport React link (optional)        | Not done | `core/in-memory-transport.mdx:9,59-69`                                  |
| 5   | Recipes card titled "Cursor chat" (optional)     | Not done | `examples/index.mdx:87-90`                                              |
| 6   | Presence list in Get started Recipes (optional)  | Not done | `get-started/meta.json:20-26`                                           |
| 7   | Layout design Troubleshooting card (round 3)     | Not done | `guides/layout-design.mdx:125-140`: no Troubleshooting card             |

## Ranked fixes

Items 1 to 3 are must-fix: item 1 holds Sidebar under 9, items 2 and 3 hold Wayfinding under 9. Items 4 to 8 are optional.

1. `examples/meta.json:25` (Sidebar): `"backends"` to `"...backends"`.
2. `react/custom-cursors.mdx:106-112` (Wayfinding): add "To hide an idle cursor, pass `filterCursor`:" and `<CursorLayer filterCursor={(cursor) => !cursor.idle} />`. Link it from `react/cursor-layer.mdx:73-78`.
3. `get-started/guides/typing-and-away.mdx:97` (Wayfinding): link "`CursorLayer`" to `/docs/react/custom-cursors#idle-cursors`.
4. `react/custom-cursors.mdx` Related: add a `Brush` card "Custom cursor rendering".
5. `core/in-memory-transport.mdx` Related: add a `Factory` card to `react/client-creation`.
6. `react/api/hooks.mdx:80`: link text "Create the client".
7. `guides/layout-design.mdx` Related: add a `LifeBuoy` card "Troubleshooting".
8. Card text wider than its target: `examples/index.mdx:87` ("Cursor chat" for six recipes), `examples/meta.json:23` ("Browse recipes" opens one recipe), `quick-start.mdx:143-145` ("Basics": "Live demos of different layouts"). The sidebar of the target section lists the rest, so none misleads.

Not checked: the rendered sidebar, the site search index, about 70 of 89 pages in full, and `format:check` for this file.
