# 038 Demo polish

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: the demo shows the shipped behavior — cursors visible above the settings dialog, spring motion by default, keyboard users visible.

Requires step 035 (focus capture) and step 037 (z-index default).

## Changes

- `apps/demo/src/components/ui/dialog.tsx`: replace `<dialog>` + `showModal()` (top layer beats every z-index) with a fixed overlay: a backdrop div plus a centered panel, `z-50` on the wrapper (below the cursor default of 9999). Keep the public API (`open`, `onClose`, `children`, `className`, `ref`, data-* pass-through) so `SettingsDialog` is untouched. Add: Escape closes the dialog; the panel receives focus on open (`tabIndex={-1}` + `focus()`).
- `apps/demo/src/cursors/cursor-layer.tsx`: drop `z-50` from the `getCursorProps` className (the package default 9999 wins inline anyway; the class is redundant).
- `apps/demo/src/use-interpolator-style.ts`: `DEFAULT_STYLE` from `"linear"` to `"spring"` (the spring interpolator already exists in `cursors/interpolators.ts`; this is a demo-only default, the library ships `none`/`linear`).
- `apps/demo/src/main.tsx`: add `captureFocus: true` to the provider's `bindingOptions`.

## Verify

- Gates 1-6 (demo changes; run Playwright). Manually: open the demo, open settings, move the mouse — the remote cursor renders above the dialog.

## Commit

`overlay the demo settings dialog and default the demo to spring motion`
