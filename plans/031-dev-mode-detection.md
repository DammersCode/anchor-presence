# 031 Dev-mode detection

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: one `isDevMode()` in core that is correct in Vite, Bun, and Node, and remove the three dynamic `process` reads in dom that are always true in browsers.

## Changes

- New `packages/core/src/import-meta-env.d.ts`: ambient `interface ImportMeta { readonly env?: { readonly DEV?: boolean } }` so `import.meta.env` type-checks. The file is not imported by the entry graph, so the declaration does not ship to consumers.
- `packages/core/src/internal/dev-warnings.ts`: replace the `isDevMode` body. Check `import.meta.env?.DEV === false` first (bundler-defined), then fall back to `process.env.NODE_ENV !== "production"`. Keep the JSDoc one-liner.
- `packages/core/src/index.ts`: export `isDevMode`.
- `packages/dom/src/registry.ts`, `packages/dom/src/transport.ts`, `packages/dom/src/auto-register.ts`: delete the local `isDev` copy and import `isDevMode` from `@anchor-presence/core`.

## Verify

- `bun run build && bun run typecheck && bun run lint && bun run test` (gates 1, 2, 4, 5; no dom/react behavior change, skip Playwright).

## Commit

`fix dev-mode detection in the browser and share it across packages`
