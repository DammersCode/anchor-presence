# 045 Standard Schema, pointer privacy, and type safety

Status: in progress · Branch: `develop` · Advisor-reviewed design.

## Goal

- Any Standard Schema library (Valibot, Zod, ArkType) can validate `user`, `context`, and event data. Types stay optional.
- An element can opt out of pointer and focus capture.
- Type safety is scanned, scored on mechanical evidence, and iterated.

## Decisions

- Core root gains no bytes. The headroom is 0.07 KB.
- Events are typed by the client: `PresenceClient<C, U, TEvents = EventMap>`. `TEvents` is inferred from `parseEvent` through the new alias `EventParser<TEvents>`, because TypeScript cannot infer from the mapped union alone. `RequiredParsers` demands `parseEvent` for a non-default map. `createEventChannel` reads its map from the client, so its cast is gone. Remaining event casts: `createEventParser` (correlated union), `emitEvent` caller in `ingest.ts` (no parser means the default map), `eventParserFrom` (a loop builds the typed map).
- `validatePresence` has no type parameters. The one cast moved to `ingest.ts`, after the parsers run, where `RequiredParsers` backs it. `RemotePresenceStore<C, U>` keeps its generics: `ingest` now rejects an untyped message for a typed store.
- `jsonEqual` in `store.ts` reads keys with `Reflect.get`, so its two casts are gone.
- Standard Schema lives in a subpath, `@dammers/anchor-presence-core/standard-schema`. The spec types are vendored (as in gridcn), so core keeps zero dependencies.
- The adapter is a parser factory. It returns a `(value: unknown) => Output | undefined` that fits `parseUser`, `parseContext`, and `createEventParser`. The client needs no new hook. `validatePresence` already runs before the parsers, so a schema never sees input over the size and depth limits.
- A schema whose `validate` returns a Promise throws a `TypeError`. Decoding is synchronous and ordered.
- A failed parse drops that field or message. An optional `onInvalid` callback reports the issues, so a peer on an older app version is visible.
- `user` and `context` take their types only from `parseUser` and `parseContext`. Without a parser they are `unknown`, and an explicit type argument without its parser does not compile. The change is type-only (`NoInfer` on the options, `RequiredParsers` on the parameter).
- `createEventParser` and `createEventChannel` keep one cast each. The parsers map proves the event shape only at runtime, and the client has no event type parameter. A third parameter would break `createEventChannel<TEvents>(client)` in the react hooks.
- React hooks and `CursorLayer` from the package take no type argument and return `unknown`: a type argument is a claim without a validator. `createPresenceHooks` creates a private React context, and its `PresenceProvider` accepts only a client of its own `PresenceClient<C, U, E>`, so the hook types follow from the provider. The result also carries a typed `CursorLayer`. A hook of the result under another provider finds no client.
- Pointer privacy is an attribute, `data-anchor-private`, read through `composedPath()`. Over a private element the client sends `null`, not the nearest anchored parent, because that parent plus `u`/`v` still leaks the position. Focus capture follows the same rule.
- The type-safety rubric and the task list are frozen before round 1.
- `RequiredParsers` tests exact identity (`IsExactly`), not `extends`. `any`, `{}`, `object`, an empty interface and `Record<string, any>` need their parser. Only `unknown` and `EventMap` need none.
- `setUser` and `setContext` are properties with function types, so TypeScript checks them contravariantly. The standalone `PresenceProvider` takes only untyped clients and has no type parameters. A typed client goes through `createPresenceHooks(...).PresenceProvider`.
- `RemotePresenceStore` needs no `in out` annotation: its private listener set already makes it invariant. A negative test pins this.

## Steps

1. Baseline scan, read-only: `any` in emitted `.d.ts`, every `as` and `!` in `src`, a consumer fixture compiled against `dist` under strict flags and both module resolutions.
2. Schema subpath with tests against real Valibot, Zod, and ArkType schemas, a type test for the no-types case, and docs.
3. Private attribute in the DOM binding, tests, perf check, and docs.
4. Type-safety rescore, fixes, and loop.
5. Rescore the docs content with the earlier rubric, click through the built site, close the small nits.

## Done when

- Gates pass. Core stays within its size budget.
- A fixture without any type argument compiles, and a fixture with a schema infers its types.
- The type-safety score is at least 9 on the frozen rubric.

## Decided skips (advisor, AFK)

- Branded IDs: the wire gives plain strings, so every consumer would cast.
- `PeerChange` as a discriminated union: no field differs by type.
- `store.ts:317` casts: the guard that removes them costs core bytes.
- `event-channel.ts:63` and `standard-schema.ts:94`: the two named correlation boundaries stay.
- Extra-key event parsers: it needs a caller-built object, and the data is still parsed. This is the one accepted leak.
- An inference helper for `createPresenceHooks`: `InferSchemaOutput` covers it. The typed-hooks page shows it.
- Exported helper types of the schema subpath (`InferSchemaOutput` and the Standard Schema interface types): they appear in public signatures, so they stay exported. Undocumented on purpose: users never write them.
- A type-level round-trip check (schema output assignable to its input): removed. It never guarded soundness, because the peer's schema validates the value and drops a bad one. A type cannot decide it: a transform that doubles a number passes, while readonly arrays and tuples each broke the check. It caused a finding in each of the last two review rounds. `onInvalid` shows the drops at run time.
