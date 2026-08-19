# UI Context

This page explains opaque context, visibility policies, dialog mismatch handling, and the rule that Anchor Presence never changes receiver UI state.

## Opaque context

`CursorPresence` carries an optional `context` field. Core treats this field as opaque: it validates its size (max 8 KiB JSON-encoded) and forwards it, but it never reads or interprets its shape.

The application sets context on the client:

```ts
client.setContext({ route: "/settings", dialog: "invite" });
```

Every outbound presence message carries the current context. On the receiver, context reaches two places: the visibility policy input, and the `context` field on each `ResolvedCursor`.

Use context for information the receiver needs to decide how to show a cursor: current route, open dialog, active tab, or similar semantic state. Do not use context for anything that must stay private; it travels on every presence message. See `docs/security.md` for validation limits and rendering rules.

## Visibility policies

A visibility policy is a pure function that decides whether a resolved cursor shows:

```ts
type VisibilityPolicy<TContext> = (input: {
  presence: CursorPresence<TContext>;
  resolution: { tier: "anchor" | "viewport" | "hidden"; anchorId: string | null; pointVisible: boolean };
}) => "show" | "hide";
```

The default policy shows cursors at the `anchor` and `viewport` tiers, and hides cursors at the `hidden` tier:

```ts
export const defaultVisibilityPolicy: VisibilityPolicy = ({ resolution }) =>
  resolution.tier === "hidden" ? "hide" : "show";
```

Pass a custom policy through `DomBindingOptions.resolution.visibilityPolicy` (dom) or `bindingOptions.resolution.visibilityPolicy` on `LiveCursorProvider` (react). A custom policy can inspect `presence.context` to apply application-specific rules on top of geometric resolution.

The resolver sets `resolution.pointVisible` to false when a clipping ancestor hides the resolved point. Use this policy to hide the cursor. This policy does not change the receiver UI.

```ts
const clippedPointPolicy: VisibilityPolicy = ({ resolution }) =>
  !resolution.pointVisible || resolution.tier === "hidden" ? "hide" : "show";
```

## Dialog mismatch handling

Anchor fallback usually covers a context mismatch by itself. If a sender's cursor sits inside an anchor named `settings.dialog.invite` and the receiver has not opened that dialog, the anchor is absent from the receiver's DOM. The fallback chain falls through to a parent anchor, for example `settings`, or to the viewport.

Some cases need an explicit policy instead of geometric fallback, because showing a cursor at the wrong place misleads the receiver. Three example policies:

1. **Hide the cursor.** If `presence.context?.dialog` names a dialog the receiver has not opened, return `"hide"`.
2. **Fall back to the dialog trigger anchor.** Register the button that opens the dialog under a stable anchor ID. When the dialog anchor is absent, the fallback chain naturally lands on the trigger button, showing the sender's cursor there instead.
3. **Show a passive presence indicator.** Instead of hiding the cursor outright, a consumer can render a muted or reduced version of the cursor for the `hidden` tier, using `tier` and `context` from the resolved cursor to choose the render.

```ts
const dialogAwarePolicy: VisibilityPolicy<{ dialog?: string }> = ({ presence, resolution }) => {
  const senderDialog = presence.context?.dialog;
  if (senderDialog !== undefined && senderDialog !== myOpenDialogId()) return "hide";
  return resolution.tier === "hidden" ? "hide" : "show";
};
```

## The "never change receiver UI state" rule

Anchor Presence never changes what the receiver's UI shows. Resolving a remote cursor position must not force a route change, open or close a dialog, expand a sidebar, or scroll the page.

This rule keeps a receiving user in full control of their own screen. A remote cursor is informational only. If a resolved position lands inside UI the receiver has not opened, the correct response is fallback or hide, never forcing that UI open to match the sender.

Consumers must not write code that reacts to `useRemoteCursors()` or `useCursorPresence()` output by mutating local UI state (dialogs, routes, sidebar toggles). Use `context` for display decisions only.
