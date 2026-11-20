# Type-safety baseline

Rubric: `rubric.md` (frozen). Scan: `node plans/research/type-safety/scan.mjs [--list]`. Fixture: `consumer-fixture/`, run by the scan (or `sh run-fixture.sh`). Measured against the working tree on `develop` plus the existing `packages/*/dist`. The tree had uncommitted edits by another agent (`packages/core/src/standard-schema.ts`, `packages/dom/src/{binding,pointer}.ts`); line numbers below are from that tree.

## Scores

| Dim                  | Evidence                                                                                                  | Score |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ----- |
| a emitted `any`      | 0 in `packages/*/dist/**/*.d.ts`                                                                          | 10    |
| b casts              | 21 holes (H7, F14); 18 L, 3 B not counted                                                                 | 3     |
| c consumer compile   | 0 errors, node16 and bundler, `skipLibCheck: false`, all strict flags                                     | 10    |
| d untyped path       | compiles; `user`/`context` are exactly `unknown` (Equal check), never `any`; 3 expect-error lines checked | 10    |
| e typed path         | 0 errors; 10 negatives, 9 `assertEqual` positives                                                         | 10    |
| f untrusted boundary | 6 leak sites                                                                                              | 4     |
| mean                 |                                                                                                           | 7.83  |

Notes on c to e: the fixture stages `dist` plus `package.json` as installed packages under `consumer-fixture/node_modules`, because the workspace links in the repo `node_modules` do not resolve on Windows (`lstat` ENOENT). It also stages `@types/react` and `csstype`. An earlier run with unresolved imports reported TS2578 on every `@ts-expect-error`, so the negatives are checked, not vacuous. The fixture never imports `react` (no JSX); hooks are only type-checked, not run. The `dom` binding generics and `useRemoteCursors` are covered only through the untyped path.

## Does `bun run typecheck` cover the type tests?

Yes, for test files; there are no `*.type-test.ts` files. The root script runs `tsc -p tsconfig.test.json`, which includes `packages/*/test` (79 test files listed by `--listFilesOnly`). It exited 0 in 2 s. Ten `@ts-expect-error` lines live in 6 files (`core/event-channel.test.ts` 3, `react/docs-react-samples.test.tsx` 2, `provider-factory.test.tsx` 2, `provider-wrapper-types.test.tsx`, `typed-hooks.test.tsx`, `user-and-peers.test.tsx`), so they are checked: an unused one would raise TS2578. Weak points: tests resolve the packages through `paths` to `src`, not `dist`; `skipLibCheck: true` in `tsconfig.base.json`; one module resolution (`bundler`); `expectTypeOf` in vitest is a runtime no-op unless typecheck mode is on, and only `tsc` checks it. The consumer fixture closes the `dist`, node16, and `skipLibCheck: false` gaps. `apps/docs` and `examples/*` typecheck separately and were not run.

## Genuine holes (F and H)

H, the type lies:

- `packages/core/src/event-channel.ts:33` `listener(event as TypedRemoteEvent<TEvents>)`: any subscriber gets a claimed type for an unparsed event.
- `packages/core/src/validate.ts:239` and `:248` `input.context as TContext`, `input.user as TUser`: remote JSON becomes the generic.
- `packages/core/src/standard-schema.ts:93` `parsers as EventParsers<...>`: a schema record is claimed to fit the mapped type (new file, untracked).
- `packages/dom/src/resolver.ts:234` `undefined as unknown as PresenceMessage`: a placeholder that is a lie.
- `packages/react/src/context-store.ts:31` `existing as ContextStore<TContext>`: a `WeakMap` keyed by client erases the generics.
- `packages/react/src/hooks/use-presence-client.ts:31` `value as PresenceProviderValue<TContext, TUser>`: the context holds `unknown, unknown`.

F, removable by a type or guard:

- `packages/core/src/event-channel.ts:56` return cast of the correlated event.
- `packages/core/src/store.ts:317` two `as Record<string, unknown>` after `typeof` checks (use an `isPlainRecord` guard).
- `packages/dom/src/binding.ts:185` and `:280` `EMPTY_SNAPSHOT as ResolvedCursor<...>[]` (declare `const EMPTY_SNAPSHOT: never[] = []`).
- `packages/react/src/hooks/use-local-context.ts:22` `undefined as TContext | undefined` (the cast is a no-op).
- `packages/react/src/hooks/use-remote-cursors.ts:17,23,52,68`, `use-remote-presence.ts:18,24`, `use-remote-users.ts:95,101`: `EMPTY_*` constants and `getServer*` widened to the generic (declare the constants `never[]`).
- `packages/react/src/typed-hooks.ts:31` `PresenceProvider as (props: ...) => ReactNode` (wrap in a typed function instead).

Not counted: 18 L (platform feature detection `globalThis as`, `win as unknown as`, DOM event narrowing in `signals.ts`, `pointer.ts`, `occlusion.ts`, `Uint8Array<ArrayBuffer>` in `transport.ts:378`, `memo` in `cursor.tsx:222`, iterator `.value` in `ingest.ts:110`, `parsers as Record` in `event-channel.ts:52`) and 3 B (`broadcast-transport.ts:41`, `cursor.tsx:34`, `standard-schema.ts:42`). No `@ts-ignore`, no `@ts-expect-error`, no non-null `!`, and no `any` anywhere in `src`.

## Untrusted-boundary leak sites (f)

1. `validate.ts:239,248` cast remote `user` and `context` to the generics.
2. `event-channel.ts:33` `subscribe` casts a raw event.
3. `internal/types.ts:72` `parseEvent: (event: RemoteEvent) => RemoteEvent | undefined`: a typed event is never proven by the client (`createEventParser` returns `TypedRemoteEvent`, which is assignable, but the client forgets it).
4. `internal/ingest.ts` `parserFor`: with no `parseUser`/`parseContext` and no local value, remote values reach typed code unparsed (only a dev warning).
5. `ingest.ts` `fitShape` stands in for a parser when a local value exists: it matches type tags, not the type argument, so `createPresenceClient<Ctx, User>({ user })` is a claim.
6. `binary-codec.ts:252` `JSON.parse` result is implicit `any` (the `jsonCodec` path returns `unknown`).

Also true, not a leak by the rubric: `PresenceClientOptions<TContext, TUser>` accepts type arguments with no parser, which is the caller's claim.

## Ranked fixes

1. `internal/types.ts`, `client.ts`, `ingest.ts`, `event-channel.ts`: make the client generic over events (`parseEvent: (event: RemoteEvent) => TypedRemoteEvent<TEvents> | undefined`) and `createEventChannel` take the client's event type, so `event-channel.ts:33` and `:56` go (leaks 2, 3; holes H1, F1).
2. `validate.ts:239,248` and `ingest.ts`: make `validatePresence` return `unknown` user and context, and let only a parser or the schema subpath produce `TUser` and `TContext`. Where no parser exists, the field type is `unknown` (leaks 1, 4, 5; holes H2, H3). Keep the type-argument form behind an explicit parser.
3. `react/src/context-store.ts:31`, `use-presence-client.ts:31`, `typed-hooks.ts:31`: replace the `unknown` context with a typed factory; key the `WeakMap` per generic or store the store on the client (holes H5, H6, F).
4. `EMPTY_*` constants in `dom/src/binding.ts`, `react/src/hooks/use-presence-client.ts`, `use-remote-users.ts`: declare them `never[]` and delete the 10 casts, plus `use-local-context.ts:22` (11 F; quick win that lifts b from 3 to 6).
5. `dom/src/resolver.ts:234` (`presence: undefined as unknown as ...`): make `presence` optional on the internal record or build the object after resolution (H4). Then `binary-codec.ts:252`: `const value: unknown = JSON.parse(...)` (leak 6), and `store.ts:317`: use `isPlainRecord`.

Reaching 9 on b needs at most 3 holes; items 1 to 5 plus `standard-schema.ts:93` get there. Reaching 9 on f needs at most 1 leak; items 1 and 2 remove 5 of 6.

## Patterns worth copying from gridcn

`registry/default/blocks/data-grid/` has `data-grid.type-test.ts`, `barrel-types.type-test.ts`, and `columns/column-helpers.type-test.ts`:

- Files named `*.type-test.ts`, so vitest's `*.test.ts` glob skips them and `tsc` alone checks them. The file header says so. Use for `packages/*/test/*.type-test.ts`.
- A local `Equal<Expected, Actual>` and `assertEqual<...>(true)`, with a `<T>() => T extends X ? 1 : 2` identity check, used on exact signatures such as `typeof gridApi.getSelection`.
- An `IsAny<T> = 0 extends 1 & T ? true : false` spot check on the barrel, so an accidental `any` in an exported type fails the compile. Anchor-presence has no such check; `consumer-fixture/untyped.ts` uses it for `user` and `context` only.
- A barrel test that imports the types the docs teach from the public entry.
- `@ts-expect-error` with a reason after each, covering removed props and union-excluded combinations.
- Key-set checks (`assertEqual<never, Extract<keyof A, keyof B>>`) for props that must not overlap.

## Amendment log

None. Scan rule added before scoring: `standard-schema.ts` line 42 classified B (a `{ then?: unknown }` probe on an `unknown` value); score before 2, after 3.
