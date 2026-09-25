# @anchor-presence/dom

`@anchor-presence/dom` is the browser layer of Anchor Presence. It registers anchors, samples the pointer, measures elements, and turns remote cursor data into screen positions.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "@anchor-presence/dom";

const client = createPresenceClient({ transport: myTransport });
const binding = createDomBinding(client);

// <button data-anchor="nav.dashboard"></button> is a live anchor.

binding.subscribe(() => {
  for (const cursor of binding.getSnapshot()) {
    if (cursor.visible) renderCursor(cursor.clientId, cursor.x, cursor.y);
  }
});
```

## Boundary rule

Dom is the only package that calls browser APIs: `getBoundingClientRect`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, and pointer events. Core stays DOM-free. Framework adapters read from dom, never from the browser directly.

## Main exports

| Export                                                         | What it does                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createDomBinding(client, options?)`                           | Wires anchor auto-registration, pointer sampling, geometry scheduling, and remote resolution to a `PresenceClient`; returns a `DomBinding`     |
| `DomBinding`                                                    | `invalidate(reason?)` marks the layout dirty for the next frame; `getSnapshot()`, `subscribe(listener)`, and `dispose()` read and manage resolved cursors |
| `createWebSocketTransport(options?)`                           | Native WebSocket transport for the bundled relay or a compatible relay; exposes `bufferedBytes()` and reconnect jitter |
| `DomBindingOptions`, `ResolutionOptions`, `EnvironmentOptions` | Binding configuration types                                                                                            |
| `WebSocketTransportOptions`                                    | WebSocket transport configuration types                                                                                |
| `ResolvedCursor`, `ResolutionTier`, `VisibilityPolicy`         | Resolution types                                                                                                       |

## Binding options

`createDomBinding` always watches the DOM for anchor elements.

```ts
type DomBindingOptions = {
  anchorAttribute?: string;
  maxAnchors?: number;
  resolution?: { visibilityPolicy?; interpolatorFactory?; hitTest? };
  environment?: { root?; window?; raf?; caf?; ResizeObserverCtor?; MutationObserverCtor? };
};
```

The `anchorAttribute` field names the attribute whose value is the anchor ID. The default is `"data-anchor"`. The attribute name may be any valid DOM attribute name, including `"id"`.

The `resolution` group controls how remote cursors turn into screen positions. It holds `visibilityPolicy`, `interpolatorFactory`, and `hitTest`.

The `environment` group supplies the DOM and timing hosts. Each field defaults to the ambient browser global. Tests can replace one host without touching the others.

### Anchor attributes

An element is an anchor when it has a non-empty value for the configured attribute.

```ts
const binding = createDomBinding(client, {
  anchorAttribute: "data-presence",
  maxAnchors: 4,
  resolution: { hitTest: true },
  environment: { raf, caf },
});

// <div data-presence="nav.dashboard"></div> is a live anchor.
```

Empty or whitespace-only values are ignored. Changing the attribute value re-registers the element under the new ID. Removing the attribute or the element unregisters the anchor. Duplicate anchor IDs use the newest registration and warn once in development.

See [Architecture](https://anchor-presence.vercel.app/docs/concepts/architecture) and [Responsive layouts](https://anchor-presence.vercel.app/docs/guides/responsive-layouts) for full guides.
