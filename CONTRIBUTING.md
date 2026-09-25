# Contributing

## Branches

Do daily work on the `dev` branch. Merge `dev` into `main` only when the work is ready. Pushes to `dev` run no CI.

## Before you push or merge to main

CI runs the browser tests on Chromium only. The Firefox and WebKit installs take too long in the pipeline, so those browsers do not run there. You must run the full browser suite locally once before you merge to `main`:

```bash
bun install
bun run build
bun run typecheck
bun run format:check
bun run lint
bun run test
bunx playwright install chromium firefox webkit
bun run test:browser
```

`bun run test:browser` starts the relay and the demo itself via `playwright.config.ts`.

Make sure that all three browser projects pass. If a test fails only in CI, reproduce it in a Linux container first:

```bash
docker run --rm -v "$(pwd):/src:ro" mcr.microsoft.com/playwright:v1.62.1-noble bash
```

## Commit rules

- Write plain, descriptive commit messages.
- Do not add Co-Authored-By trailers or tool references.
- Keep comments to one short line, and only for a non-obvious why.
- Run `bun run format` before you commit. Prettier owns formatting; the CI format check fails otherwise.

## What CI runs

CI splits the checks so that no check runs twice and CI minutes stay low.

On a pull request from the repository owner (`.github/workflows/pr.yml`), the fast checks run:

1. Build (`bun run build`).
2. Typecheck (`bun run typecheck`): packages, tests, demo, docs site, and backend examples.
3. Format check (`bun run format:check`).
4. Lint (`bun run lint`).
5. Unit and integration tests (`bun run test`). The real SignalR hub test skips itself because the runner has no .NET.

Pull requests from other authors skip at zero minutes. To check one, run the workflow on its branch from the Actions tab.

On a push to `main` (`.github/workflows/main.yml`), the slow suites run once:

1. The real SignalR hub test (.NET 10).
2. The benchmark guard (`bun run bench`, 3× the committed baseline).
3. The demo production build.
4. Browser tests on Chromium (preinstalled Chrome, no download).
5. The docs build.

A release does not repeat these checks. `.github/workflows/release.yml` waits for the Main checks run of the tagged commit and publishes only when it is green.

## Releasing

Versions are lockstep: one number for `core`, `dom`, and `react`. Never edit a package `version` by hand.

Release from `main`:

```bash
git checkout main && git merge dev
npm version patch
```

Use `npm version minor` or `npm version major` for a bigger jump. `npm version` runs `preversion` (the full gate: build, typecheck, lint, test), then the `version` hook (syncs the version into every manifest and the lockfile, stages them, and creates the `v*` tag), then `postversion` (pushes the branch and the tag). The pushed `v*` tag starts `.github/workflows/release.yml`, which verifies the tag and versions agree, publishes each package with npm trusted publishing (OIDC, no token), and creates a GitHub release.

Trusted publishing is set up once per package on npmjs.com: package settings → Publishing access → add a Trusted Publisher → GitHub, repository `DammersCode/anchor-presence`, workflow `release.yml`. The first version of a package cannot use OIDC, so publish it once by hand from an authenticated machine, in order core, dom, react (after `bun run build` and `node scripts/check-release.mjs`):

```bash
cd packages/core && npm publish --access public
```

If a run fails after a partial publish, fix and re-run the workflow; already published versions are skipped.

`npm version` needs a clean working tree and a passing gate; it aborts otherwise.
