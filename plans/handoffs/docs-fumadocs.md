# Handoff: docs-fumadocs

Branch `docs-fumadocs`, worktree `C:/repos/danny/ap-wt-docs`. Spec: `plans/023-fumadocs-docs-site.md` (dev) plus the brief in this session (see "Decisions made" for where they differ).

## Done

All committed on `docs-fumadocs`:

- `scaffold apps/docs fumadocs app with brand port and live demo shell` — package.json, tsconfig, next.config.mjs, postcss.config.mjs, source.config.ts, `lib/*`, `app/global.css` (brand tokens ported from `site/index.html`), `app/layout.tsx`, `app/(home)/*`, `app/docs/*`, LLM routes (`llms.txt`, `llms-full.txt`, `llms.mdx/docs/[[...slug]]`), OG route, search route, sitemap/robots, icon, `components/*` (mdx, page-actions, install-command, code-from-source, logo), the live `<Demo>` (two iframes over a `BroadcastChannel` transport), `content/docs/**/meta.json`. Also: `.prettierignore` updated, `packages/dom/README.md` exports table fixed to document `DomBinding`/`invalidate()`, `skills/anchor-presence/SKILL.md` Source section repointed at the docs site.
- `write docs content: getting started, concepts, guides, reference, examples` — all 27 MDX pages: getting-started (introduction, installation, quick-start), concepts (anchors-and-fallbacks, architecture, ui-context), guides (react, ssr-and-strict-mode, responsive-layouts, transports, codecs, security, performance, ai-agents, troubleshooting), reference (core, dom, react, using `AutoTypeTable`), examples (basics, anchors-and-fallbacks, presence-list, custom-cursor-rendering, interpolation-styles, occlusion-and-scroll-containers, backends/{index,socketio,signalr}). Added `components/auto-type-table.tsx` (file-system-cached generator, matching gridcn's pattern).
- `migrate docs/*.md into apps/docs and repoint readmes at the docs site` — deleted `docs/*.md`, rewrote every cross-reference in `README.md`, `SECURITY.md`, `packages/{core,dom,react}/README.md` to point at `https://anchor-presence.vercel.app/docs/...`, shortened the root README's quick start to use `usePresenceClient`, replaced the docs file table with one link, added a `CHANGELOG.md` Unreleased entry for the docs site.
- `add vercel config, docs ci job, root scripts; remove github pages site` — `apps/docs/vercel.json`, removed `site/` and `.github/workflows/pages.yml`, added a `docs` job to `ci.yml`, root `docs:dev`/`docs:build` scripts, `.gitignore` additions for `apps/docs/.next`/`.source`/`next-env.d.ts`, a `bun run format` pass that normalized pre-existing CRLF-vs-LF noise across the whole repo (see "Decisions made"), a fix for `demo-scene.tsx`'s effect-cleanup type error, and the missing `lucide-react`/`clsx`/`tailwind-merge` deps caught by the first real build.

## In progress

Nothing. All planned content, config, and cleanup are committed. Task complete as of `309ea0a`.

## Next

Nothing required. If a future agent picks this up: the parallel Bun-native/Node-ws/Hono/Elysia backend pages are not part of this branch (see "Decisions made") — check whether that work landed elsewhere before adding them to `backends/meta.json`.

## Decisions made (and why)

- **Two `<iframe>` panes, not two `<div>`s, for `<Demo>`.** Verified against `packages/dom/src/binding.ts` (`EnvironmentOptions.root` is typed `Document`, not `Element`) and `packages/dom/src/pointer.ts` (pointer listener attaches to `window`). Two bindings in one document/window would double-register identical anchor IDs and both read the same `window` pointermove stream. Iframes give each pane its own `Document`/`Window`, which the API already assumes.
- **`BroadcastChannel` transport instead of `createInMemoryPair` for the live demo.** `createInMemoryPair` is in-process (module-level `Set`s); it cannot cross the iframe realm boundary without a relay. `BroadcastChannel` is same-origin and native across iframes and tabs, so it also satisfies the "works across two browser tabs" ask for free. `createInMemoryPair` is still the right choice for the quick-start's zero-backend code sample, since that one runs in a single realm.
- **`backends/meta.json` lists only `index`, `socketio`, `signalr`.** Direct instruction from this task's brief: another agent is adding Bun native/Node ws/Hono/Elysia in parallel. `plans/023-fumadocs-docs-site.md` on `dev` lists those four extra pages too — that plan text looks stale relative to the live parallel-work split; do not add those pages here.
- **Landing-page ticker removed, not real-data-driven.** UX note said drive it from real data or drop it. The real live `<Demo>` already sits in the hero where the product screenshot was; a second live number readout felt redundant, so it was dropped rather than rebuilt.
- **`gitConfig.branch = "main"`** in `lib/shared.ts` (not `docs-fumadocs`): it feeds GitHub "view source" links on the deployed site, which should point at the default branch readers actually see.
- **Root `build` script now filters to only `core`/`dom`/`react`**, not a bare `@anchor-presence/*` glob. That glob would also match `@anchor-presence/docs` and run `next build` as part of every routine root build; `docs:build` is the explicit, separate entry point for that instead, matching the brief's ask for a `docs:build` script and keeping the fast root build fast.
- **Ran `bun run format` (prettier `--write`) across the whole repo, not just `apps/docs`.** This worktree's checkout has CRLF line endings on disk (confirmed via `file` and `git config core.autocrlf=true`) even though `git diff` shows zero real changes for any file outside what this task touched (verified with `git diff --ignore-space-at-eol --ignore-all-space`, which reduced the diff to exactly this task's own files plus `bun.lock`). `format:check` failed repo-wide before this pass and passes clean after. This is a pre-existing worktree/environment artifact, not something introduced by this task's content; fixing it in git config was out of scope, so normalizing on disk via the repo's own formatter was the safe, in-scope fix. Re-verify with `git status`/`git diff` before committing to confirm no unintended semantic changes rode along (none were found).

## Blockers / open questions

None. `bun install` and `bun run build` (root and `apps/docs`) both succeed from a clean state (`.next`/`.source` removed first). All AGENTS.md gates pass: build, typecheck, format:check, lint, chromium e2e, and unit tests (409 passed).
