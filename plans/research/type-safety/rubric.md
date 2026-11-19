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

None.
