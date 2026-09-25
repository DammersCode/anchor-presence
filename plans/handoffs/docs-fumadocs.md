# Handoff: docs-fumadocs

Branch `docs-fumadocs`, worktree `C:/repos/danny/ap-wt-docs`. Spec: `plans/023-fumadocs-docs-site.md` (dev) plus the brief in this session (see "Decisions made" for where they differ).

## Done

Not yet committed — this is the first pass, uncommitted in the working tree as of writing. First commit lands right after this file.

- Scaffolded `apps/docs` (package.json, tsconfig, next.config.mjs, postcss.config.mjs, source.config.ts) targeting the same fumadocs-core/ui/mdx and Next 16.3.5 versions as gridcn, with `@anchor-presence/{core,dom,react}` as `workspace:*`.
- `lib/shared.ts`, `lib/source.ts`, `lib/utils.ts`, `lib/layout.shared.tsx`, `lib/read-example-source.ts`.
- Brand port into fd tokens: `app/global.css` (light/dark palette from `site/index.html`, Sora/Inter fonts, gradient utility, reduced-motion gates).
- `app/layout.tsx`, `app/(home)/layout.tsx`, `app/(home)/page.tsx` (landing page port: hero, how-it-works, guarantees, run-it — ticker replaced by the real `<Demo>`), `app/docs/layout.tsx`, `app/docs/[[...slug]]/page.tsx`.
- LLM routes: `app/llms.txt`, `app/llms-full.txt`, `app/llms.mdx/docs/[[...slug]]`, OG route `app/og/docs/[...slug]`, search route `app/api/search`, `sitemap.ts`, `robots.ts`, `public/icon.svg`.
- `components/mdx.tsx`, `components/page-actions.tsx` (Copy Markdown / Open in ChatGPT / Open in Claude), `components/install-command.tsx`, `components/code-from-source.tsx`, `components/logo.tsx`.
- Live demo: `components/demo.tsx` (dynamic import, `ssr:false`) -> `components/demo/demo-panes.tsx` (two `<iframe>`s) -> `app/demo-frame/[variant]/page.tsx` + `demo-frame-page.tsx` -> `components/demo/demo-scene.tsx` (real `createPresenceClient` + `usePresenceClient` + `LiveCursorProvider` + `CursorLayer`) -> `components/demo/broadcast-transport.ts` (a `BroadcastChannel`-backed `LiveCursorTransport`).
- `content/docs/**/meta.json` for the full IA (see "Decisions made" for the tree).
- `content/docs/getting-started/introduction.mdx` and `installation.mdx` written.
- Root: `.prettierignore` updated with `apps/docs/.next`, `apps/docs/.source`.
- `packages/dom/README.md`: exports table now documents `DomBinding` and `invalidate()`.
- `skills/anchor-presence/SKILL.md`: Source section now points at the docs site and `llms.txt` first.

## In progress

- Writing the rest of `content/docs/**`: quick-start (in-memory-pair-first, then `usePresenceClient` + relay), concepts (anchors-and-fallbacks, architecture, ui-context), guides (react, ssr-and-strict-mode, responsive-layouts, transports, codecs, security, performance, ai-agents, troubleshooting), reference (core, dom, react — consider `AutoTypeTable`), examples (basics, anchors-and-fallbacks, presence-list, custom-cursor-rendering, interpolation-styles, occlusion-and-scroll-containers, backends/{index,socketio,signalr}).
- Source prose for concepts/guides is drafted from `docs/*.md` (already close to simple-english); still needs the per-page pass, then delete `docs/*.md` and repoint README links.

## Next

1. Finish content migration (see "In progress"), run the `simple-english` self-check per AGENTS.md.
2. Delete `docs/*.md`, update `README.md` and package READMEs to link the docs site instead.
3. `vercel.json` in `apps/docs` (installCommand/buildCommand from repo root).
4. Remove `site/` and `.github/workflows/pages.yml`; add a `docs` job to `ci.yml`; add root `docs:dev`/`docs:build` scripts.
5. Update root `README.md` (short) and `CHANGELOG.md` Unreleased.
6. `bun install` at worktree root, then `bun run build` inside `apps/docs` from a clean state.
7. Run every AGENTS.md gate before the final commit.

## Decisions made (and why)

- **Two `<iframe>` panes, not two `<div>`s, for `<Demo>`.** Verified against `packages/dom/src/binding.ts` (`EnvironmentOptions.root` is typed `Document`, not `Element`) and `packages/dom/src/pointer.ts` (pointer listener attaches to `window`). Two bindings in one document/window would double-register identical anchor IDs and both read the same `window` pointermove stream. Iframes give each pane its own `Document`/`Window`, which the API already assumes.
- **`BroadcastChannel` transport instead of `createInMemoryPair` for the live demo.** `createInMemoryPair` is in-process (module-level `Set`s); it cannot cross the iframe realm boundary without a relay. `BroadcastChannel` is same-origin and native across iframes and tabs, so it also satisfies the "works across two browser tabs" ask for free. `createInMemoryPair` is still the right choice for the quick-start's zero-backend code sample, since that one runs in a single realm.
- **`backends/meta.json` lists only `index`, `socketio`, `signalr`.** Direct instruction from this task's brief: another agent is adding Bun native/Node ws/Hono/Elysia in parallel. `plans/023-fumadocs-docs-site.md` on `dev` lists those four extra pages too — that plan text looks stale relative to the live parallel-work split; do not add those pages here.
- **Landing-page ticker removed, not real-data-driven.** UX note said drive it from real data or drop it. The real live `<Demo>` already sits in the hero where the product screenshot was; a second live number readout felt redundant, so it was dropped rather than rebuilt.
- **`gitConfig.branch = "main"`** in `lib/shared.ts` (not `docs-fumadocs`): it feeds GitHub "view source" links on the deployed site, which should point at the default branch readers actually see.

## Blockers / open questions

- None yet. `bun install` / `bun run build` in `apps/docs` has not been run yet (next step) — version or peer-dep conflicts against the workspace's `typescript ^7.0.2` are the main risk to watch (gridcn pins `@typescript/typescript6`; this repo's root is plain `typescript@^7.0.2`, and `apps/docs/package.json` currently declares its own `typescript ^5.9.0` devDependency, which may get hoisted/deduped oddly under Bun workspaces — verify after install).
