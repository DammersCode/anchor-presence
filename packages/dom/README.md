# @anchor-presence/dom

`@anchor-presence/dom` is the browser layer of Anchor Presence. It registers anchors, samples the pointer, measures elements, and turns remote cursor data into screen positions.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

This sample binds a client to the page and draws each visible remote cursor:

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

`@anchor-presence/dom` is the package that reads the DOM layout and the pointer with `getBoundingClientRect`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, and pointer events. `@anchor-presence/core` has no DOM code and listens only for `visibilitychange`. Framework adapters read from `@anchor-presence/dom`, never from the browser directly.

## Main exports

| Export                                                         | What it does                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createDomBinding(client, options?)`                           | Connects anchor auto-registration, pointer sampling, geometry scheduling, and remote resolution to a `PresenceClient`. Returns a `DomBinding`.                                                                                       |
| `DomBinding`                                                   | `invalidate(reason?)` marks the layout dirty for the next frame. `getSnapshot()`, `subscribe(listener)`, and `dispose()` read and manage resolved cursors. `getAnchorElement(anchorId)` returns the element of an anchor, or `null`. |
| `createWebSocketTransport(options?)`                           | Native WebSocket transport for the bundled relay or a compatible relay. It has `bufferedBytes()` and a random delay between reconnect attempts.                                                                                      |
| `createBroadcastChannelTransport(channelName)`                 | `BroadcastChannel` transport for the tabs and iframes of one origin. It needs no server.                                                                                                                                             |
| `DomBindingOptions`, `ResolutionOptions`, `EnvironmentOptions` | Binding configuration types                                                                                                                                                                                                          |
| `WebSocketTransportOptions`                                    | WebSocket transport configuration types                                                                                                                                                                                              |
| `ResolvedCursor`, `ResolutionTier`, `VisibilityPolicy`         | Resolution types                                                                                                                                                                                                                     |

## Binding options

`createDomBinding` always watches the DOM for anchor elements. The binding options have this shape:

```ts
type DomBindingOptions = {
  anchorAttribute?: string;
  privateAttribute?: string;
  maxSentAnchors?: number;
  resolution?: ResolutionOptions;
  environment?: EnvironmentOptions;
  capturePointer?: boolean;
  captureFocus?: boolean;
};
```

The `anchorAttribute` field names the attribute whose value is the anchor ID. The default is `"data-anchor"`. The name must start with a letter and contain only letters, digits, and single hyphens, for example `"id"` or `"data-presence"`. For another name, such as `"data_anchor"`, `createDomBinding` throws a `TypeError`.

The `privateAttribute` field names the attribute that keeps the cursor private. The default is `"data-anchor-private"`. Over an element with it, and over its descendants, the binding sends no cursor. It follows the same name rule as `anchorAttribute`.

The `resolution` group (`ResolutionOptions`) controls how remote cursors turn into screen positions. It holds `visibilityPolicy`, `interpolatorFactory`, and `hitTest`.

The `environment` group (`EnvironmentOptions`) supplies the DOM and timing hosts: `root`, `window`, `raf`, `caf`, `ResizeObserverCtor`, and `MutationObserverCtor`. Each field defaults to the matching browser global. Tests can replace one host without touching the others.

`capturePointer` defaults to `true`. If it is `false`, the local pointer publishes no cursor, and context and user still reach peers (other clients in the same room). `captureFocus` defaults to `false`. If it is `true` and local capture is on, a focus change publishes a cursor at the center of the focused element.

### Anchor attributes

An element is an anchor when it has a non-empty value for the configured attribute. This binding reads anchors from `data-presence`:

```ts
const binding = createDomBinding(client, {
  anchorAttribute: "data-presence",
  maxSentAnchors: 4,
  resolution: { hitTest: true },
  environment: { raf, caf },
});

// <div data-presence="nav.dashboard"></div> is a live anchor.
```

The binding ignores an empty value or a value with only whitespace. A change of the attribute value registers the element again under the new ID. If you remove the attribute or the element, the binding unregisters the anchor. For a duplicate anchor ID, the binding uses the newest registration and warns one time in development.

See [How it works](https://anchor-presence.vercel.app/docs/get-started/concepts/how-it-works) and [Responsive layouts](https://anchor-presence.vercel.app/docs/get-started/concepts/responsive-layouts) for full guides.
