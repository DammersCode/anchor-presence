# 026 Example previews

Status: done · Branch: `dev`

Owner feedback (2026-09-25): every example page embeds the same `<Demo />` (sidebar + three cards). The pages look identical, so a reader cannot see what each example shows. Model: gridcn example pages (`C:/repos/danny/gridcn/content/docs/examples/**`): each page has its own demo, a "What's in the demo" list that says what to try, and links to the behavior docs.

## Preview framework

- `<ExamplePreview scene="<name>" />` renders the scene twice, in two iframes (`/demo-frame/<scene>/<layout>`), connected by the `BroadcastChannel` transport. Each pane has a caption: layout name and what differs ("4 columns", "2 columns, stacked").
- Receiver insight, so the difference is visible without reading code:
  - the receiver outlines the element the remote cursor resolved to;
  - a small status chip in the receiver shows `tier` and `anchorId` of the remote cursor.
- Guided tour: when nobody moves the pointer, a scripted remote user in the wide pane tours the scene's interesting anchors (via `client.updateLocalCursor` with real anchor points). It stops as soon as the reader moves the pointer, and resumes after a few seconds of no input. It pauses when the preview is off-screen or the tab is hidden. Under reduced motion it jumps between stops without gliding.
- Scene-specific controls sit inside the panes (toggle, select, scroll), never outside.
- Each scene lives in one file, `apps/docs/components/examples/<scene>.tsx`, written as copy-paste-ready example code. The page shows it through `<CodeFromSource docs=... />`. Framework plumbing (tour, status chip, outline) lives in `apps/docs/components/examples/_preview/`, not in scene files.
- Works in light and dark theme, at phone width (panes stack; each pane keeps its designed layout), and with keyboard (controls are real buttons and selects).

## Scenes and pages

Every page follows: intro paragraph (what the demo shows) → `<ExamplePreview />` → `## What's in the demo` (what to try, bullets) → `## Code` → `## Behavior reference` (links into Core, DOM, React) → `## Related`.

| Page (slug)                       | Scene             | Wide layout                                               | Narrow layout                                                    | What the reader sees                                                |
| --------------------------------- | ----------------- | --------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `basics`                          | `basics`          | three buttons in a row                                    | three buttons stacked                                            | same button, different position                                     |
| `responsive-grid` (new)           | `responsive-grid` | 4-column card grid, cards of mixed sizes (spans)          | 2-column grid, cards reflow                                      | cursor stays on the same card across reflow and different sizes     |
| `table-and-cards` (new)           | `table-and-cards` | data table: rows × columns (name, status, amount, action) | each row as a stacked card with the same fields                  | cursor on a cell lands on the same field inside the card            |
| `anchors-and-fallbacks`           | `fallbacks`       | table with 8 rows and a row-action column                 | only 4 rows rendered, no action column; toggle to hide a section | tier and fallback visible in the status chip; outline on the parent |
| `occlusion-and-scroll-containers` | `scroll`          | full list                                                 | short scroll container                                           | row scrolled out → cursor hidden or "out of view" hint              |
| `presence-list`                   | `presence`        | who-is-online bar + three tour users                      | same bar, compact                                                | users appear, one goes idle (dimmed), one leaves                    |
| `custom-cursor-rendering`         | `custom-cursors`  | renderer select: default, name pill, avatar, crosshair    | same select                                                      | the same remote cursor in different renderers                       |
| `interpolation-styles`            | `interpolation`   | tour jumps between far-apart anchors                      | select: none, linear, spring                                     | the glide changes with the selected interpolator                    |

The home page hero and the quick start keep the existing `<Demo />`.

## Acceptance

- Each example page shows a visibly different preview; a screenshot of any two pages is distinguishable at a glance.
- The tour runs without input, stops on pointer input, and pauses off-screen.
- `bun run docs:build`, `bun run typecheck`, `bun run lint`, `bun run format:check` pass.
- Checked with `agent-browser` screenshots: every page, light and dark, 1440 px and 390 px.

## Outcome

- Framework: `apps/docs/components/examples/_preview/` (`example-preview.tsx` page component, `example-frame.tsx` pane, `tour.ts` scripted users, `use-tour-control.ts` input/visibility control, `resolution-insight.tsx` status bar and outline, `scenes.ts` captions and tours, `scene-components.ts` scene registry, `control.ts` control messages).
- Route: `app/demo-frame/[scene]/[layout]`. Scene `home` serves the unchanged home and quick-start `<Demo />`.
- Scenes: `apps/docs/components/examples/<scene>.tsx`, shown on each page through `<CodeFromSource docs=... />`.
- LLM markdown drops `<ExamplePreview ... />` like `<Demo />`.
