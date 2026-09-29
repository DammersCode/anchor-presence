# 040 Docs, skills, and changelog

Status: open · Branch: `audit-improvements` · Part of [030](030-multi-audit.md)

Goal: every doc, sample, and the changelog match the new API. Prose in `simple-english` (run its self-check). All code samples must compile against the current API.

## Changes

- `README.md` (root): quick start uses the provider `factory` (no `usePresenceClient`, no `autoConnect` flag — the client connects itself by default).
- `packages/react/README.md`: API table — drop the `usePresenceClient` row, add the provider `factory` row; update the usage sample and the "never disposes on unmount" wording to "disposes the client it created on unmount".
- `packages/core/README.md`: `autoConnect` default `true` wording.
- `apps/docs/content/docs/get-started/quick-start.mdx`: factory sample; drop the `autoConnect: true` mention or state the default.
- `apps/docs/content/docs/react/index.mdx`: replace the `usePresenceClient` table row with the provider `factory`.
- `apps/docs/content/docs/react/use-presence-client.mdx`: replace the page content with "Creating the client" (provider `factory` as the standard path, `client` prop as bring-your-own, `createPresenceClient` for manual control; drop the registry/key story). Rename the file to `client-creation.mdx`, update `apps/docs/content/docs/meta.json` and every link to the old page.
- `apps/docs/content/docs/react/ssr-and-strict-mode.mdx`: factory-in-provider pattern; drop the module-registry explanation.
- `apps/docs/content/docs/react/live-cursor-provider.mdx`: document `factory` and the `client` prop (client wins when both are set; the provider disposes clients it created).
- `apps/docs/content/docs/core/presence-client.mdx`: `autoConnect` default `true`.
- `apps/docs/content/docs/react/api/hooks.mdx`: drop the `usePresenceClient` section.
- `apps/docs/content/docs/core/build-a-framework-adapter.mdx`: replace the `usePresenceClient` mention with the provider `factory`.
- `apps/docs/content/docs/skills/integration.mdx`: step 4 wording.
- `skills/anchor-presence/SKILL.md`: sample uses the provider `factory`; drop `autoConnect: true`; the SSR/StrictMode bullet describes the provider effect. `skills/anchor-presence/transports.md` and `skills/anchor-presence/troubleshooting.md`: `autoConnect` now defaults to `true`.
- `CHANGELOG.md` under `## Unreleased` (breaking entries first): `usePresenceClient` removed, provider `factory` added, `autoConnect` default `true`, cursor default z-index `9999` + `zIndex` prop, `localCursorCapture`/`captureFocus` binding options, `isDevMode` exported from core, `RemotePresenceStore.hasActiveCursors` + `PresenceClient.hasActiveCursors`, optional `Interpolator.sampleInto`, plus a performance note (pointer chain cache, allocation-free resolver frames).

## Verify

- Gates 1-5 (docs/skills only; doc samples are type-checked by `bun run typecheck`).

## Commit

`document the provider factory and the audit changes`
