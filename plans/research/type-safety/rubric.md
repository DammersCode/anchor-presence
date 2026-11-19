# Type-safety rubric (frozen)

Goal: 100% type safety, and the API stays usable with no type argument. Score each dimension 0-10 from mechanical evidence. Run `node plans/research/type-safety/scan.mjs`; it prints the table.

## Freeze note

Tasks and rubric do not change between rounds. An amendment goes in the log at the end, with the score before and after the amendment, both reported. A score never improves by editing the rubric alone.

## Dimensions

### (a) Emitted declarations

Count of the word `any` in code (comments and strings removed) in `packages/*/dist/**/*.d.ts`.

- 10: 0.
- Each occurrence: minus 2, floor 0.
- 9 means exactly 0 or 1 occurrence, and the one occurrence is in a documented, intended position.

### (b) Casts in source

Every `as X`, `as unknown as`, non-null `!`, `@ts-ignore`, `@ts-expect-error` in `packages/*/src` (`as const` and import aliases excluded). Each gets one class:

- B: boundary parse. A cast of untrusted data to a shape whose fields stay `unknown`, followed by checks. Not a hole.
- L: lib gap. A DOM, platform, iterator, or React typing limit; sound at runtime. Not a hole.
- F: fixable. A cast that a better type or a guard removes, such as a frozen empty array widened to a generic. Counts as a hole.
- H: genuine hole. The cast asserts what the compiler cannot verify, and nothing at runtime backs it for every caller. Counts as a hole.

Score = 10 minus ceil(holes / 3), floor 0, where holes = F + H. Any `@ts-ignore` or non-null `!` counts as a hole each. 9 means at most 3 holes. An unclassified cast defaults to H.

### (c) Consumer compile

`consumer-fixture/` stages `packages/*/dist` with each `package.json` as installed packages, then compiles `untyped.ts` and `typed.ts` with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `skipLibCheck: false`, under `moduleResolution: node16` and `bundler`.

- Score = 10 minus the total number of errors across both modes, floor 0.
- 9 means one error in total.

### (d) Untyped path

`consumer-fixture/untyped.ts` uses no type argument anywhere. It must compile in both modes. `user` and `context` (from `useLocalUser`, `useLocalContext`, `useRemoteUsers`, `useRemoteCursors`) must be exactly `unknown`, never `any`. Its `@ts-expect-error` lines prove that `unknown` needs narrowing.

- Score = 10 minus the errors across both modes, floor 0.
- 9 means one error.

### (e) Typed path

`consumer-fixture/typed.ts`: `createPresenceClient`, `createEventChannel`, `createEventParser`, `createPresenceHooks`, and `PresenceProvider` infer from parsers, from local values, and from type arguments. `assertEqual` checks exact types. `@ts-expect-error` negatives prove rejection.

- Score = 10 minus the errors across both modes, floor 0. Cap at 9 when the file has fewer than 10 `@ts-expect-error` negatives or fewer than 8 `assertEqual` positives.
- 9 means one error, or full pass with the cap.

### (f) Untrusted boundary

Remote data from the network reaches typed code only through a validator or parser. The scan keeps a registry of leak sites. Each is counted while its pattern exists in `src`:

1. `validatePresence` casts remote `user` and `context` to the generics (`validate.ts`).
2. `createEventChannel.subscribe` casts a raw event to the typed event (`event-channel.ts`).
3. `parseEvent` is typed `RemoteEvent -> RemoteEvent`, so a typed event is never proven.
4. A remote `user` or `context` with no `parseUser` or `parseContext` and no local value is not parsed (`ingest.ts`, `parserFor`).
5. A shape check stands in for a parser when a local value exists. It checks type tags, not the type argument.
6. `binary-codec.ts` takes `JSON.parse` output as implicit `any`.

Score = 10 minus the number of leak sites, floor 0. 9 means one leak. A new leak site is added to the registry with an amendment entry.

## Mean

The unweighted mean of the six scores. Done when the mean is at least 9 and no dimension is below 9.

## Amendment log

1. Parsers-only typing rule. The fixture lines that claimed `user` and `context` types from local values or from a type argument without a parser became `@ts-expect-error` negatives and `unknown` assertions. Dimensions c and e counted those four lines as compile errors (c 6, e 6, mean 7.33) before the amendment. After it, the same code scores c 10 and e 10. Both scores are reported in every later round.

2. Events and hooks follow the parsers-only rule. The fixture lines that took typed events and typed hooks from a client without `parseEvent` now use a client that carries its event map. Three negatives that failed for two reasons at once now isolate one reason, and the weak `& User` positive is now an exact assertion. Before the amendment the fixture had two compile errors (c 8, e 8, mean 8.33 on the 8.67 base). After it, c and e are 10 again. Both scores are reported in every later round.

3. Parsers-only rule closes two registry leaks, and the round-2 review adds three. Leaks 4 ('no parser and no local value: user/context pass unparsed') and 5 ('shape check stands in for a parser when a local value exists') are sound under the rule: without a parser the type is exactly `unknown`, and `RequiredParsers` tests exact identity so `any`, `{}`, `object`, and `Record<string, any>` also need a parser (nine pinned negatives). They are closed. The round-2 reviewer added three sites: L-d (extra runtime keys in a parsers or schemas object), L-e (supertypes and `any` passing the parser check, fixed), L-f (method bivariance on `RemotePresenceStore.ingest`, did not reproduce: the private listener set makes the class invariant). L-d stays as the one accepted leak (a caller must build the object by hand, and the data is still parsed). Dimension f: 5 before the amendment, 8 after closing 4 and 5 (re-derived by the reviewer: 7 before the L-e fix, 9 with L-d as the single accepted leak). Both scores are reported in every later round.

Amendment 3 also reclassifies two casts: `ingest.ts` `event as TypedRemoteEvent` (sound after the exact-identity check: without `parseEvent` the map is the default) and `presence as PresenceMessage<...>` (sound: the types come from the parsers that ran just before). Both move from hole to boundary. Casts: 5 hole lines before, 3 after. Scan before the amendment: b 8, f 8, mean 9.33. After: see the next round. Both scores are reported.
