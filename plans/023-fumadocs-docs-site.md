# 023 Fumadocs docs site

Status: done (merged into `dev`) · Branch: `docs-fumadocs` · Worktree: `C:/repos/danny/ap-wt-docs`

## Goal

Replace the single-file GitHub Pages site (`site/index.html`, `.github/workflows/pages.yml`) with a Fumadocs app in `apps/docs`, deployed on Vercel. The reference for structure and features is gridcn (`C:/repos/danny/gridcn`, <https://gridcn.vercel.app>).

## Spec

- App: `apps/docs`, package `@dammers/anchor-presence-docs` (private), Next.js + fumadocs-core/ui/mdx with the same versions as gridcn, Tailwind v4. Uses the workspace packages through `workspace:*`.
- Design: keep the look of `site/index.html`: fonts, indigo `#4F46E5` → cyan `#22D3EE` gradient, logo, dark and light mode. Map the colors to the Fumadocs `--color-fd-*` tokens. The home page keeps the section order hero → what it does → how it works → guarantees → quick start.
- Content: `apps/docs/content/docs/**` with `meta.json`. Sections: Getting started (introduction, installation, quick start), Concepts, Guides, API reference, Examples, AI agents. `docs/*.md` moves into the app and is then deleted.
- Quick start: zero-backend first run with `createInMemoryPair`, then the relay setup. Uses `usePresenceClient`.
- Live demos: two panes with different layouts, connected by an in-browser transport. Client-only, lazy-loaded. Demo source is read from files, so code on the page cannot drift.
- Example page order: problem paragraph → live demo → install command → code tabs → behavior notes → `## Related`.
- Backend pages: `content/docs/examples/backends/{index,socketio,signalr,bun-native,node-ws,hono,elysia}.mdx`. Server code comes in through `<include>` from `examples/**`.
- LLM: `/llms.txt`, `/llms-full.txt`, per-page `.mdx` routes, "Copy Markdown" and "Open in ChatGPT/Claude" actions, an "AI agents" page for the shipped skill `skills/anchor-presence`.
- Search (Orama), OG images, sitemap, robots, `metadataBase` = `https://anchor-presence.vercel.app`.
- Vercel: `apps/docs/vercel.json` installs with Bun from the repo root and builds the packages first. The owner imports the repo in Vercel with Root Directory `apps/docs`.
- Prose: `simple-english` skill. The landing ticker shows real demo data or is removed. Smooth scroll and blur respect `prefers-reduced-motion`.

## Acceptance

- `bun run build` in `apps/docs` passes from a clean state. Every page is statically generated.
- Root gates pass (build, typecheck, format, lint, test, chromium e2e).
- CI builds the docs app. `site/` and `pages.yml` are removed.
- Every code sample compiles against the current public API.
