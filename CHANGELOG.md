# Changelog

## 0.1.0 - unreleased

- `@anchor-presence/core`: initial release
- `@anchor-presence/core`: `RemotePresence` gains `idle`; `RemotePresenceStore` and `createPresenceClient` gain `idleAfterMs` (default `DEFAULT_IDLE_AFTER_MS`, clamped below `staleTimeoutMs`)
- `@anchor-presence/dom`: initial release
- `@anchor-presence/dom`: `createDomBinding` defaults to no easing when the OS prefers reduced motion
- `@anchor-presence/dom`: `ResolvedCursor` gains `idle`
- `@anchor-presence/react`: initial release
- `@anchor-presence/react`: `useRemoteUsers` entries gain `idle`; `CursorLayer` dims an idle cursor's opacity (no transition under reduced motion)
