# Docs navigation, beginner reader, round 6

Reader: knows React, has never used a presence or live-cursor library. Scope: `apps/docs/content/docs/**`. I read all 8 `meta.json` files and every index page (Introduction, Examples, Backends, React, DOM by headings, Core, Skills) and the new Recipes page. In full or in large part: Quick start, CursorLayer, Connection status, Remote users, Core Remote presence (peer changes to reconnect). By headings or grep: Custom cursors, Typing and away, Local context and user, In-memory transport, Layout design, Troubleshooting, Presence list, Join and leave announcer. I grepped every `title:` (89 pages) for duplicate sidebar labels. Click rules as in rounds 1 to 5: `/docs` opens Introduction (0). A sidebar link, card, or in-page link is 1 click. A section switch is 2.

## Scores

| Dimension      | Score | Short reason                                                                                     |
| -------------- | ----- | ------------------------------------------------------------------------------------------------ |
| Sidebar        | 8.5   | The Backends duplicate is gone, but Recipes and Backends now sit under "Presence and rendering". |
| Findability    | 9     | All five tasks take 2 clicks or fewer. "label", "connection", "idle", "mobile" all hit.          |
| Page structure | 9     | Pages open with what and when. The Recipes page follows the index-page pattern.                  |
| Placement      | 8.5   | The React page for peers never says how long a dropped peer stays.                               |
| Wayfinding     | 9     | Both round-5 idle fixes are in. Hide-idle now has a sample and two inbound links.                |
| Path fit       | 9     | First cursor 1 click, label 1 click, own outage 2 clicks.                                        |
| Consistency    | 9     | Card icons match targets. Small text leftovers only.                                             |

Mean: 62 / 7 = 8.9 (rounds 1 to 5: 7.9, 8.6, 8.8, 8.9, 8.9).

## Evidence for the scores below 9

**Sidebar 8.5.** `examples/meta.json:18-23`: the separator `Presence and rendering` covers Presence list, Custom cursor rendering, Interpolation styles, then the link "Recipes" and the folder "Backends". There is no separator between them, so a beginner reads recipes and relays as rendering topics. The overview page gives each its own heading (`examples/index.mdx:84,93`). Duplicate labels: the separator "Recipes" sits directly above the page "Recipes" (`get-started/meta.json:20-21`). This is the lead-page pattern I accepted for Binding, Resolution, Transports, and Codecs, so it does not cost a point. No other duplicate label. To reach 9: in `examples/meta.json`, insert a separator with a new name between lines 21 and 22, for example `"---[signpost]Next steps---"`. Do not name it "Recipes" or "Backends", because both names are rows below it.

**Placement 8.5.** Task 5 (a peer drops). `react/remote-users.mdx:74-75` lists `"leave"` and links to core for "the rules of each type". The 70-second default and "no leave message on a lost connection" live only at `core/remote-presence.mdx:42,66,79` and in an example note (`examples/presence-list.mdx:51`). `react/connection-status.mdx:60-62` covers only your own outage. To reach 9: add one bullet to `react/remote-users.mdx` after line 74: "A peer that loses its connection sends no leave message. The store removes it after `staleTimeoutMs`, 70 seconds by default. See [Stale timeout](/docs/core/remote-presence#stale-timeout)."

## Task walks

**Task 1: first remote cursor.** Introduction card Quick start (1). Full `App.tsx`, the Vite create command, two windows, then a relay. Total 1 click. No dead end.

**Task 2: cursors must not jump on mobile.** Get started > Layout design for presence (1). Related "Touch behavior" (2) and "Troubleshooting" (2, `layout-design.mdx:143`, new since round 5). Total 1 click. No dead end.

**Task 3: test with several users.** Quick start (1) > "Test with more users": third window, `bun run dev --host` for a phone, relay. No browser: in-memory link (2). Weak spot unchanged: `core/in-memory-transport.mdx:9` says "try the provider and the hooks" but Related (`:57-66`) has no link to `react/client-creation`.

**Task 4 (new): show a cursor label with the user's name.** Quick start (1): the sample sets `user: { name }` and line 54 says `CursorLayer` shows `user.name`. For a custom label: React > CursorLayer > Label and color (2, `cursor-layer.mdx:45-65`). For a name the user edits: React > Local context and user (2), which links back to the defaults (`local-context.mdx:38`). Total 1 click. No dead end. Small gap: Quick start line 54 names `CursorLayer` without a link.

**Task 5 (new): handle a user who loses connection.** Own connection: React > Connection status (2): banner, delayed banner, "Cursors during an outage", close reasons. A peer's connection: React > Remote users (2) > core Peer changes (3) > Stale timeout. Or Core > Remote presence (2), a section a React beginner does not open first. Total 2 to 3 clicks, answer found, but not on the first page. Soft dead end, see Placement.

## Round-5 findings: are they fixed?

| #   | Finding                                         | Verdict  | Evidence                                                                                                                                                                                                       |
| --- | ----------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backends separator plus folder (must-fix)       | Fixed    | `examples/meta.json:22-23`: folder only. New grouping issue above.                                                                                                                                             |
| 2   | Hide idle cursors sample (must-fix)             | Fixed    | `custom-cursors.mdx:114-118`; `cursor-layer.mdx:81` links to it                                                                                                                                                |
| 3   | Typing and away link to idle styling (must-fix) | Fixed    | `typing-and-away.mdx:97` links `/docs/react/custom-cursors#idle-cursors`                                                                                                                                       |
| 4   | Custom cursors Related: rendering example       | Not done | `custom-cursors.mdx:124-133`: CursorLayer, Remote users, Components API                                                                                                                                        |
| 5   | In-memory transport: React link                 | Not done | `in-memory-transport.mdx:9,57-66`                                                                                                                                                                              |
| 6   | Hooks API link text "Client creation"           | Not done | `react/api/hooks.mdx:80`                                                                                                                                                                                       |
| 7   | Layout design: Troubleshooting card             | Fixed    | `layout-design.mdx:143`                                                                                                                                                                                        |
| 8   | Card text wider than target                     | Mostly   | Recipes link and card fixed (`examples/meta.json:22`, `examples/index.mdx:87-89`); "layout design guide" left at `stable-layout.mdx:35`; Basics "Live demos of different layouts" at `quick-start.mdx:143-144` |

## Ranked fixes

Items 1 and 2 are must-fix. Each lifts one dimension to 9 (mean 9.0). Items 3 to 6 are optional.

1. `examples/meta.json` between lines 21 and 22 (Sidebar): a separator such as `"---[signpost]Next steps---"`.
2. `react/remote-users.mdx` after line 74 (Placement): the dropped-peer bullet with the stale-timeout link.
3. `react/connection-status.mdx` Related: a card to `/docs/core/remote-presence#after-a-reconnect`.
4. `quick-start.mdx:54`: link `CursorLayer` to `/docs/react/cursor-layer#label-and-color`.
5. Round-5 items 4, 5, 6 above.
6. `EyeOff` marks both "Occlusion and scroll containers" (`examples/index.mdx:59`) and "Typing and away" (`recipes.mdx:31`).

Not checked: the rendered sidebar (grouping inferred from meta order), the site search index, about 70 of 89 pages in full, `format:check` for this file.
