# Plan 010: Add configurable cursor components to the React npm package

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before the next step. If a STOP condition occurs, stop
> and report. Do not improvise. When the work is complete, update this plan row
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9687cde..HEAD -- SPECIFICATION.md README.md docs/react.md packages/react apps/demo/src/cursors/CursorLayer.tsx e2e`
> If an in-scope file changed, compare the live file with the excerpts below.
> If a relevant API or test contract changed, stop and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (new public React API and hot render path)
- **Depends on**: plans/002-npm-publish-readiness.md and plans/009-performance-verification.md
- **Category**: direction
- **Planned at**: commit `9687cde`, 2026-08-19

## Why this matters

The npm packages provide cursor behavior, but each consumer must write its own cursor layer.

The demo contains a useful cursor layer, but it assumes demo-specific user fields and Tailwind classes.

Add an optional default cursor to the React package. Keep all visual decisions configurable through `CursorLayer` properties.

Do not add a shadcn registry. npm remains the only installation method.

## Current state

- `SPECIFICATION.md:26` states that rendering is consumer-controlled and no cursor component is required.
- `SPECIFICATION.md:41` defines the dependency direction as `react → dom → core`.
- `packages/react/src/index.ts` exports one provider and six hooks. It exports no cursor component.
- `packages/react/src/hooks.ts:63-74` implements `useRemoteCursors` with `useSyncExternalStore`.
- `packages/react/src/provider.tsx` owns only the client and DOM binding context.
- `apps/demo/src/cursors/CursorLayer.tsx` contains a fixed SVG, label, Tailwind classes, and demo user assumptions.
- `packages/react/package.json` has no style dependency and sets `sideEffects` to `false`.
- `packages/react/test/rerenderIsolation.test.tsx` proves that cursor snapshots do not render sibling components.
- `packages/react/test/perf.test.tsx` contains the React render budget and cleanup tests.
- `e2e/helpers.ts:79-90` reads geometry from the element with `data-testid="remote-cursor"`.
- The npm registry returned 404 for all three package names on 2026-08-19.

The approved API design is also recorded in
`plans/designs/2026-08-19-configurable-cursor-components-design.md`.
This plan contains all required decisions, so that file is not required for execution.

## Required public API

Create `packages/react/src/cursor.tsx` and export these values:

```ts
export { CursorLayer, DefaultCursor };
```

Export these types:

```ts
export type {
  CursorLayerProps,
  CursorRenderProps,
  DefaultCursorProps,
};
```

Use this API shape:

```ts
type CursorRenderProps<TContext = unknown, TUser = unknown> = {
  cursor: ResolvedCursor<TContext, TUser>;
  label: ReactNode;
  color: string;
};

type CursorLayerProps<TContext = unknown, TUser = unknown> = {
  getLabel?: (cursor: ResolvedCursor<TContext, TUser>) => ReactNode;
  getColor?: (cursor: ResolvedCursor<TContext, TUser>) => string;
  filterCursor?: (cursor: ResolvedCursor<TContext, TUser>) => boolean;
  getCursorProps?: (
    cursor: ResolvedCursor<TContext, TUser>,
  ) => Omit<ComponentPropsWithoutRef<"div">, "children">;
  renderCursor?: (props: CursorRenderProps<TContext, TUser>) => ReactNode;
};

type DefaultCursorProps = {
  label?: ReactNode;
  color?: string;
  className?: string;
  style?: CSSProperties &
    Partial<
      Record<
        | "--anchor-presence-cursor-color"
        | "--anchor-presence-cursor-size"
        | "--anchor-presence-cursor-label-color",
        string
      >
    >;
  labelClassName?: string;
  labelStyle?: CSSProperties;
};
```

Do not add more public properties without operator approval.

## Required runtime behavior

`CursorLayer` must call `useRemoteCursors` once.

For each snapshot, apply these operations in order:

1. Remove cursors with `visible: false`.
2. Apply `filterCursor` when it exists.
3. Calculate the label and color.
4. Read `getCursorProps` when it exists.
5. Render one package-owned root for each remaining cursor.

Use `null` when `getLabel` does not exist. Use `#6b7280` when `getColor` does not exist.

The package must not inspect fields in `cursor.user`.

The root must use these package-owned values:

```ts
{
  position: "fixed",
  left: 0,
  top: 0,
  pointerEvents: "none",
  transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
}
```

Set `zIndex` to `50` by default. Consumer styles can replace `zIndex` and other non-geometry styles.

Spread consumer root properties before package-owned properties. Package geometry and identity must take precedence.

Add these root attributes:

- `aria-hidden="true"`
- `data-anchor-presence-cursor`
- `data-anchor-presence-client-id`
- `data-anchor-presence-tier`
- `data-anchor-presence-anchor`

Use an empty string for a null anchor ID.

If `renderCursor` exists, render its result inside the root. Otherwise, render `DefaultCursor`.

Do not catch errors from consumer callbacks. React error boundaries must receive those errors.

`DefaultCursor` must meet these requirements:

- Use no Tailwind classes or external style file.
- Use the existing simple pointer SVG shape as the initial visual.
- Use `20px` as the default size.
- Use `#6b7280` as the default color.
- Use white as the default label color.
- Do not render a label for `null` or `undefined`.
- Support the three CSS variables in `DefaultCursorProps`.
- Give explicit CSS variables precedence over the `color` property.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bunx tsc --build packages/core packages/dom packages/react` | exit 0, no errors |
| React tests | `bunx vitest run --project react` | all React tests pass |
| Full unit tests | `bunx vitest run` | all tests pass, 0 failed |
| Demo build | Run `bunx vite build` from `apps/demo` | exit 0 |
| Focused browser tests | `bunx playwright test e2e/cross-layout-chromium.spec.ts e2e/occlusion.spec.ts e2e/perf.spec.ts --project=chromium` | 0 failed |
| Full browser tests | `bunx playwright test` | 0 failed; only intentional skips |
| Package dry run | Run `bun publish --dry-run` from `packages/react` | exit 0; only package files listed |
| Diff check | `git diff --check` | exit 0, no output |

Use Bun as the package manager. Run tests through Vitest with `bunx`.

Never run `bun test`. Never run `bun publish` without `--dry-run`.

## Suggested executor toolkit

- If available, use `vercel-react-best-practices` for the render-path review.
- If available, use `simple-english` for all documentation changes.
- Use no browser automation outside the existing Playwright suite.

## Scope

**In scope**:

- `packages/react/src/cursor.tsx` (create)
- `packages/react/src/index.ts`
- `packages/react/test/cursor.test.tsx` (create)
- `packages/react/package.json` (description only)
- `apps/demo/src/cursors/CursorLayer.tsx`
- `SPECIFICATION.md`
- `README.md`
- `packages/react/README.md`
- `docs/react.md`
- `plans/README.md` (status only)

**Out of scope**:

- All files in `packages/core` and `packages/dom`
- `packages/react/src/provider.tsx`
- `packages/react/src/context.ts`
- Existing hook behavior
- Protocol, transport, codec, resolver, or scheduler behavior
- `apps/demo/src/cursors/PresencePill.tsx`
- `apps/demo/src/cursors/setup.ts`
- `apps/demo/src/cursors/transport.ts`
- `apps/demo/src/cursors/visibilityPolicy.ts`
- `apps/demo/src/cursors/interpolators.ts`
- All existing end-to-end test files
- A shadcn registry or new UI package
- New dependencies or lockfile changes
- A visual configuration provider
- Real npm publication

## Git workflow

- Use an isolated worktree on branch `advisor/010-configurable-react-cursors`.
- Preserve unrelated user changes.
- Use plain, descriptive commit messages.
- Do not add an AI mention or `Co-Authored-By` trailer.
- Use one short comment only for a non-obvious reason.
- After all gates pass, commit the verified unit.
- After all gates pass, integrate the commit and push it to `origin/main`.
- Never force-push.

## Steps

### Step 1: Run the drift and publication checks

Run the drift command from the plan header.

Run `bun pm view` for each package name:

```text
@anchor-presence/core
@anchor-presence/dom
@anchor-presence/react
```

A 404 means that the package is still unpublished. Keep all versions at `0.1.0`.

If any lookup returns package data, stop and report. A public API release decision is then required.

If the registry lookup fails only because network access is unavailable, record that fact. Do not change package versions.

**Make sure**: the source excerpts still match and no package returned published metadata.

### Step 2: Write the failing React component tests

Create `packages/react/test/cursor.test.tsx`.

Use `makeFakeClient` and `makeFakeBinding` from `packages/react/test/testUtils.ts`.

Model React mounting and cleanup on `packages/react/test/rerenderIsolation.test.tsx`.

Add tests for these cases:

1. `DefaultCursor` renders a neutral SVG without a label.
2. `getLabel` and `getColor` change the default visual.
3. `renderCursor` replaces only the root contents.
4. Consumer styles cannot replace package geometry.
5. Consumer styles can replace `zIndex`.
6. `getCursorProps` adds a class and test attributes.
7. Hidden cursors do not render.
8. `filterCursor` removes selected visible cursors.
9. `CursorLayer` renders an empty server snapshot with `renderToString`.
10. Cursor snapshot updates do not render a sibling component.
11. Label and color callbacks do not run for removed cursors.

Use complete `ResolvedCursor` fixtures, including `pointVisible`.

**Make sure**: `bunx vitest run --project react packages/react/test/cursor.test.tsx` fails because the new component module does not exist.

If the test command does not select the file with this syntax, run `bunx vitest run packages/react/test/cursor.test.tsx --project react`.

### Step 3: Implement the package components

Create `packages/react/src/cursor.tsx` with both components and all three public types.

Use only React, `@anchor-presence/dom` types, and the existing `useRemoteCursors` hook.

Keep all module initialization free of DOM access.

Merge root styles in this order:

1. Default `zIndex`.
2. Consumer style from `getCursorProps`.
3. Package geometry values.

Spread package data attributes and `aria-hidden` after consumer properties.

Update `packages/react/src/index.ts` with the required exports.

Update only the description in `packages/react/package.json` to mention optional cursor components.

Do not add an export subpath. Keep the existing root export.

**Make sure**:

- `bunx vitest run --project react` passes.
- `bunx tsc --build packages/core packages/dom packages/react` exits 0.
- `packages/react/test/boundary.test.ts` passes without a new allowed dependency.

### Step 4: Migrate the demo without changing its appearance

Keep `apps/demo/src/cursors/CursorLayer.tsx` as a thin demo adapter.

Import the package `CursorLayer` with an alias that avoids the local export name.

Rename the local visual component to `DemoCursor`.

Keep the existing SVG, label, palette validation, and Tailwind classes in the demo.

Use module-level functions for `getLabel`, `getColor`, `getCursorProps`, and `renderCursor`.

Use `getCursorProps` to keep these existing attributes on the package-owned root:

- `data-testid="remote-cursor"`
- `data-cursor-name`
- `data-cursor-anchor`
- `data-cursor-tier`

The element with `data-testid="remote-cursor"` must retain the inline `translate3d` transform.

Do not change `App.tsx`, `PresencePill`, or any end-to-end test selector.

**Make sure**:

- Run `bunx vite build` from `apps/demo`. The command exits 0.
- Run the focused browser command. It reports 0 failed tests.

### Step 5: Update the specification and documentation

Update `SPECIFICATION.md` before the remaining public documentation.

- Increase the specification version from `1.2` to `1.3`.
- Keep Invariant 9 and state that no cursor component is required.
- State that the React package supplies optional configurable cursor components.
- Add `CursorLayer` and `DefaultCursor` to the React adapter section.
- Keep the demo renderer as proof of consumer control.

Update the root quick start to use the package `CursorLayer`.

Update `packages/react/README.md` and `docs/react.md` with:

- A minimal `<CursorLayer />` example.
- A label and color mapping example.
- A `filterCursor` example.
- A `getCursorProps` example.
- A custom `renderCursor` example.
- The package-owned geometry rule.
- The three CSS variables.
- The rule that remote user data is untrusted.

Use Simplified Technical English. Use sentences with 20 words for procedures and 25 words for descriptions.

Do not state that the components require Tailwind or shadcn.

**Make sure**:

- Search all documentation for the old statement `ships no required cursor component`.
- Every remaining occurrence must agree with the optional component design.
- `bunx tsc --build packages/core packages/dom packages/react` exits 0.

### Step 6: Run every final gate

Run each command from the command table. Run the performance specification three separate times.

Do not loosen a test budget after a failure.

Run the React package dry run from `packages/react`. Inspect its file list.

The dry run must contain `dist/cursor.js` and its declaration output. It must not contain source or test files.

Update Plan 010 to `DONE` in `plans/README.md` after all gates pass.

**Make sure**:

- Typecheck exits 0.
- React and full Vitest suites report 0 failed tests.
- The demo build exits 0.
- Focused and full Playwright suites report 0 failed tests.
- Three separate performance runs report 0 failed tests.
- The package dry run exits 0 and lists only expected package files.
- `git diff --check` reports no errors.
- `git status --short` lists only in-scope files and the approved planning files.

### Step 7: Commit and hand off

Review every diff hunk against this plan.

Commit the verified change with this message:

```text
Add configurable React cursor components
```

After the local review, integrate the commit and push it to `origin/main`.

Do not run a real npm publish command.

Report the commit SHA, test totals, intentional browser skips, performance results, and dry-run file list.

## Test plan

The new test file contains 11 focused component tests.

Use `packages/react/test/rerenderIsolation.test.tsx` for render-count structure.

Use `packages/react/test/ssr.test.tsx` for server-render structure.

Use `packages/react/test/testUtils.ts` for the client and binding fakes.

The existing Playwright suite proves that demo geometry and visibility stay unchanged.

The existing performance specification proves that the migration stays inside the browser budgets.

## Done criteria

- [ ] `CursorLayer` and `DefaultCursor` are public npm exports.
- [ ] The public types match the approved API exactly.
- [ ] The default cursor is neutral, Tailwind-free, and label-free.
- [ ] Consumers can map labels, colors, filters, root properties, and contents.
- [ ] The package owns position, transform, pointer events, accessibility, and identity attributes.
- [ ] The demo keeps its current visual design and test selectors.
- [ ] `SPECIFICATION.md` version `1.3` describes the optional components.
- [ ] The three documentation files contain the new API examples.
- [ ] No source file in core or DOM changed.
- [ ] No provider, context, protocol, transport, or hook behavior changed.
- [ ] No dependency or lockfile changed.
- [ ] All commands in Step 6 pass.
- [ ] The package dry run contains the compiled cursor module.
- [ ] `plans/README.md` marks Plan 010 as `DONE`.
- [ ] The implementation has one plain commit and no AI attribution.

## STOP conditions

Stop and report if any condition occurs:

- An Anchor Presence package now exists in the npm registry.
- The live API differs from the current-state excerpts in a way that changes this design.
- The work requires a core, DOM, provider, context, protocol, transport, or hook change.
- The default component requires a new dependency or external style file.
- The demo selectors cannot remain on the package-owned positioned root.
- A performance budget fails twice on an otherwise clean run.
- The package dry run omits the cursor module or includes source and test files.
- A required verification command fails twice after a reasonable correction.
- An out-of-scope file must change to complete the feature.

## Maintenance notes

Keep visual configuration on `CursorLayer`. Do not move it into `LiveCursorProvider` without a new public API decision.

Keep geometry properties package-owned. A consumer renderer only replaces root contents.

If consumers request another default visual property, first use `renderCursor`. Add a public property only when that route cannot work.

If the package is published before this plan runs, select a new lockstep package version before implementation.

The owner performs real npm publication after review.
