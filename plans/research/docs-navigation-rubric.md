# Docs navigation and structure rubric

Two readers score the docs site: a **beginner** (knows React, has never used presence or cursor sync) and an **expert** (has built realtime features, wants the API, limits, and wire details fast). Goal: every dimension ≥ 9 from both, no dimension below 8.

Score from 0 to 10 in half steps. Cite evidence (file path or sidebar entry) for every score below 9.

| Dimension      | 9 means                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar        | Top-level groups follow the reader's path. Names say what a page holds. No group hides a page the reader needs first. Page order inside a group is logical.  |
| Findability    | The reader finds any task or API in at most two clicks from the docs root, or with one search term. No fact is only reachable through a deep link.           |
| Page structure | Each page opens with what it is and when to use it. Sections follow one order across page types. Headings are scannable and match what the sidebar promises. |
| Placement      | Each fact lives on the page a reader would look in first. Concepts, how-to guides, reference, and examples are not mixed on one page.                        |
| Wayfinding     | Related links, Cards, and cross-links connect neighbours. Every page tells the reader where to go next. No dead ends, no loops, no duplicate homes.          |
| Path fit       | The beginner path (first run, first cursor, first layout) is clear and short. The expert path (API, options, limits, transports) skips the basics.           |
| Consistency    | Same term, same icon, same page template for the same kind of page. No stale names.                                                                          |

Method: read `apps/docs/content/docs/**/meta.json`, then every index page, then a sample of at least ten pages across all groups. Walk three tasks per reader, counting clicks. Report the tasks, the clicks, and the dead ends.
