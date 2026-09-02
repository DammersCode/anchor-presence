# @anchor-presence/dom

`@anchor-presence/dom` is the browser layer of Anchor Presence. It registers anchors, samples the pointer, measures elements, and turns remote cursor data into screen positions.

[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createDomBinding } from "@anchor-presence/dom";

const client = createPresenceClient({ transport: myTransport });
const binding = createDomBinding(client);

const unregister = binding.registry.register("nav.dashboard", buttonElement);

binding.subscribe(() => {
  for (const cursor of binding.getSnapshot()) {
    if (cursor.visible) renderCursor(cursor.clientId, cursor.x, cursor.y);
  }
});
```

## Boundary rule

Dom is the only package that calls browser APIs: `getBoundingClientRect`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, and pointer events. Core stays DOM-free. Framework adapters read from dom, never from the browser directly.

## Main exports

| Export | What it does |
|---|---|
| `createDomBinding(client, options?)` | Wires an anchor registry, pointer source, geometry scheduler, and resolver to a `PresenceClient` |
| `DomBindingOptions`, `ResolutionOptions`, `EnvironmentOptions` | Binding configuration types |
| `createAnchorRegistry()` | The anchor ID to `Element` registry |
| `attachPointerSource(client, registry, options?)` | Outbound pointer sampling |
| `createGeometryScheduler(options)` | The read/compute/notify rAF scheduler |
| `RemoteResolver`, `resolveGeometry`, `findResolvableAnchor`, `defaultVisibilityPolicy` | Remote cursor resolution |
| `ResolvedCursor`, `ResolutionTier`, `VisibilityPolicy` | Resolution types |

## Binding options

`createDomBinding` takes a `maxAnchors` limit plus two option groups.

The `resolution` group controls how remote cursors turn into screen positions. It holds `visibilityPolicy`, `interpolatorFactory`, and `hitTest`.

The `environment` group supplies the DOM and timing hosts. It holds `root`, `window`, `raf`, `caf`, `ResizeObserverCtor`, and `MutationObserverCtor`.

Each `environment` field defaults to the ambient browser global. Tests can replace one host without touching the others.

```ts
const binding = createDomBinding(client, {
  resolution: { hitTest: true },
  environment: { raf, caf },
});
```

See [docs/architecture.md](../../docs/architecture.md) and [docs/responsive-layouts.md](../../docs/responsive-layouts.md) in the repository root for full guides.
