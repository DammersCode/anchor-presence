# @anchor-presence/dom

The browser layer of Anchor Presence.

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

Dom is the only package that calls browser APIs: `getBoundingClientRect`, `ResizeObserver`, `MutationObserver`, `requestAnimationFrame`, pointer events. Core stays DOM-free; framework adapters read from dom, never from the browser directly.

## Main exports

- `createDomBinding(client, options?)` — wires an anchor registry, pointer source, geometry scheduler, and resolver to a `PresenceClient`
- `createAnchorRegistry()` — the anchor ID to `Element` registry
- `attachPointerSource(client, registry, options?)` — outbound pointer sampling
- `createGeometryScheduler(options)` — the read/compute/notify rAF scheduler
- `RemoteResolver`, `resolveGeometry`, `findResolvableAnchor`, `defaultVisibilityPolicy` — remote cursor resolution
- `ResolvedCursor`, `ResolutionTier`, `VisibilityPolicy` — resolution types

See `docs/architecture.md`, `docs/concepts.md`, `docs/responsive-layouts.md`, and `docs/performance.md` in the repository root for full guides.
