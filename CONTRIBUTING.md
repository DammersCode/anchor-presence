# Contributing

## Branches

Do daily work on the `dev` branch. Merge `dev` into `main` only when the work is ready. Each push to `main` triggers one CI run.

## Before you push or merge to main

CI runs the browser tests on Chromium only. The Firefox and WebKit installs take too long in the pipeline, so those browsers do not run there. You must run the full browser suite locally once before you merge to `main`:

```bash
bun install
bun run typecheck
bun run test
bunx playwright install chromium firefox webkit
bun run test:browser
```

Make sure that all three browser projects pass. If a test fails only in CI, reproduce it in a Linux container first:

```bash
docker run --rm -v "$(pwd):/src:ro" mcr.microsoft.com/playwright:v1.62.1-noble bash
```

## Commit rules

- Write plain, descriptive commit messages.
- Do not add Co-Authored-By trailers or tool references.
- Keep comments to one short line, and only for a non-obvious why.

## What CI runs on each push to main

1. Typecheck (`tsc --build`) for core, dom, and react.
2. All unit tests (`vitest run`).
3. Core benchmarks (report-only).
4. The demo production build.
5. Browser tests on Chromium (preinstalled Chrome, no download).
