# Framework adapters: Solid and Vue

Status: open (planning only, not scheduled)

This plan describes two future framework adapters that sit next to `@anchor-presence/react`. It does not change `@anchor-presence/core` or `@anchor-presence/dom`. Both adapters do the same job as `react`: connect a `PresenceClient` and a `DomBinding` to one framework's reactivity, with no protocol or DOM logic of their own.

## Goal

Let a Solid or Vue app add live cursors with the same three-layer model the docs describe in [Build a framework adapter](https://anchor-presence.vercel.app/docs/core/build-a-framework-adapter): `core` runs the protocol, `dom` runs the browser binding, and the adapter is a thin, framework-shaped subscription layer.

## Package names

- `@anchor-presence/solid`
- `@anchor-presence/vue`

Both depend on `@anchor-presence/core` and `@anchor-presence/dom` only. Neither depends on the other, and neither depends on `@anchor-presence/react`.

## What each package exports, mirroring react

`@anchor-presence/react` exports a provider component, `usePresenceClient`, read hooks (`useCursorClient`, `useCursorStatus`, `useCursorPresence`, `useCursorContext`, `useRemoteCursors`, `useRemoteCursorsSelector`, `useRemoteUsers`), and the optional `CursorLayer`/`DefaultCursor` pair. Each new adapter exposes the same shape in its framework's idiom:

- **Solid** (`@anchor-presence/solid`): a `LiveCursorProvider` component using Solid context, `createPresenceClient` factory hook (`createPresenceClientResource` or similar, mirroring `usePresenceClient`'s once-per-key creation), and signal-returning primitives for each `react` hook (`useCursorClient`, `useCursorStatus`, `useRemoteCursors`, and so on, returning Solid signals instead of React state). An optional `CursorLayer` built on `<For>`.
- **Vue** (`@anchor-presence/vue`): a `LiveCursorProvider` component (or a plugin plus `provide`/`inject`), a composable mirroring `usePresenceClient`, and a composable per `react` hook returning `Ref`/`computed` values (`useCursorClient`, `useCursorStatus`, `useRemoteCursors`, and so on). An optional `CursorLayer` built on `v-for`.

Both packages re-export the `core` and `dom` types their own signatures use, the way `packages/react/src/index.ts` does, and both ship `test/public-api.test.ts` pinning their exports, per [Package boundaries](https://github.com/DammersCode/anchor-presence/blob/main/AGENTS.md).

## Mechanics (shared across both)

1. Create the `DomBinding` with `createDomBinding(client, options)` in the framework's mount lifecycle (Solid: inside a component or `createRoot`; Vue: `onMounted` or a composable's setup scope), once per `client` identity.
2. Dispose it in the matching cleanup (Solid: `onCleanup`; Vue: `onUnmounted`).
3. Bridge `binding.subscribe`/`binding.getSnapshot` into the framework's reactive primitive (Solid: a signal updated from the subscription callback; Vue: a `shallowRef` written on each notification).
4. Skip binding creation with no `window`, matching `isBrowser()` in `packages/react/src/provider.tsx`, so SSR (SolidStart, Nuxt) stays safe.
5. Hold no cursor, presence, or status state inside the adapter beyond what the reactive bridge needs; read `client` and `binding` on every update instead of caching derived values.

## Test strategy

- Each package gets its own `test/public-api.test.ts`, following `packages/react/test/public-api.test.ts`.
- Component and composable tests run against `@solidjs/testing-library` (Solid) and `@vue/test-utils` (Vue), using `createInMemoryPair` from `@anchor-presence/core` for a same-process two-client setup, the same pattern `packages/react/test` uses today.
- A doc-sample type-check, following `packages/react/test/doc-samples.test.tsx`, so every code sample on the future `/docs/solid` and `/docs/vue` tabs compiles against the real package.
- No new e2e specs until a demo exists for the framework; reuse `packages/dom`'s existing binding tests as the shared contract both adapters sit on top of.

## Docs

Each adapter gets its own Fumadocs root-folder tab (`/docs/solid`, `/docs/vue`), mirroring the `react` tab: an overview page, an SSR guide if the framework needs one, and an API reference page. No work starts on these pages before the package itself exists.
