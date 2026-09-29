# 042 Dialog example, demo dialog rule, and option docs

Status: in progress · Branch: `audit-improvements`

Goal: the dialog/layer case gets a live docs example and the demo app enforces it; the new 035 options (`captureFocus`, `localCursorCapture`) get docs prose.

## Changes

- `apps/docs/components/examples/_preview/tour.ts`: new `context` tour step that calls `client.setContext`.
- `apps/docs/components/examples/dialogs.tsx`: new scene. A team board of four cards; the wide pane runs an invite dialog that loops open and closed. A visibility policy hides (a) a cursor whose sender context names a dialog the pane has not opened and (b) a background cursor while the pane's own dialog is open. The cursor paints above the dialog via the `zIndex` default.
- `scenes.ts` + `scene-components.ts`: register the `dialogs` scene. Tour: Mira publishes the dialog context and points inside the dialog, Theo stays on a card behind it.
- `apps/docs/content/docs/examples/dialogs-and-layers.mdx` + `examples/meta.json`: the page.
- `apps/demo/src/cursors/visibility-policy.ts`: hide a background cursor while the local settings dialog is open (the reverse direction the demo policy lacks). Tests in the existing spec.
- `apps/docs/content/docs/dom/pointer-capture.mdx`: a keyboard-focus section for `captureFocus` and the touch-lift clear.
- `apps/docs/content/docs/dom/binding.mdx`: option prose for `localCursorCapture` and `captureFocus`.

## Verify

- Gates 1-6 (docs preview components and demo app changes).

## Commits

- `add a dialogs and layers example`
- `hide background cursors while the demo dialog is open and document the binding options`
