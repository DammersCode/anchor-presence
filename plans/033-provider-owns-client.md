# 033 Provider owns client creation (breaking)

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: one standard creation path. The provider takes a `factory` and owns the client lifecycle; `usePresenceClient` and its module-level registry are removed. The `client` prop stays as bring-your-own.

## Changes

- `packages/react/src/provider.tsx`:
  - Props: `factory?: () => PresenceClient<TContext, TUser>`, `client?: PresenceClient<TContext, TUser> | null` (optional now; when both are set, `client` wins and the factory never runs), `binding?`, `bindingOptions?`, `children?`.
  - The client-creation effect runs once per provider mount (empty deps, factory read from a latest-ref), in an effect, SSR-safe (never runs on the server). It stores the created client in state and disposes it on unmount (`client.dispose()` sends the leave message and disconnects the transport).
  - The existing binding effect keys off the effective client (`providedClient ?? ownClient`).
  - JSDoc: the provider creates and disposes the client it made; a `client` prop is not disposed by the provider.
- Delete `packages/react/src/hooks/use-presence-client.ts`; update `packages/react/src/hooks/index.ts`.
- `packages/react/src/index.ts`: remove `usePresenceClient` and the `PresenceClientFactoryOptions` export.
- `packages/react/test/public-api.test.ts`: drop `"usePresenceClient"` from the pinned keys.
- `packages/react/test/presence-client.test.tsx`: replace the hook tests with provider-factory tests: client created in a mount effect (children render with `null` before), same instance across re-renders, disposed on unmount, StrictMode double-invoke creates-disposes-creates with one live client, SSR render returns children with a null client and never runs the factory.
- `packages/react/test/skill-samples.test.tsx`: update the sample to the provider-factory pattern.
- `apps/demo/src/cursors/setup.ts`: delete the module singleton `client` and `getPresenceClient` (keep `localUserName`, `localRoom`, `backendId`, the `PageId`/`DemoContext`/`DemoUser` types, and the palette exports).
- `apps/demo/src/main.tsx`: the provider gets `factory={() => { const { transport, codec } = createBackendTransport(backendId, localRoom); return createPresenceClient<DemoContext, DemoUser>({ transport, codec, user: { name: localUserName, color: colorForName(localUserName) } }); }}`. The `key={interpolatorStyle}` remount stays (bindingOptions are read once per binding).
- `apps/docs/components/examples/_preview/example-frame.tsx`: drop `usePresenceClient`. Add a small local hook `usePreviewClient(channel: string, clientOptions?: ...)` (`useState` + `useEffect`, creates the broadcast-channel transport and client, disposes on unmount) so the scenes keep receiving the `client` prop unchanged.
- `SPECIFICATION.md` line ~366: replace the `usePresenceClient` row with the provider `factory` row.

## Verify

- Gates 1-6 (react package and both apps change; run `bunx playwright test --project=chromium`).

## Commit

`make the provider own client creation and drop usePresenceClient`
