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
- Run `bun run format` before you commit. Prettier owns formatting. Without it, the CI format check fails.

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

## Performance budgets

`bun run perf:score` measures the library and gives each metric a score against a budget. The script reads the built packages. Build them first:

```bash
bun run build
bun run perf:score
```

To also measure the relay, add `--relay`:

```bash
bun run perf:score --relay
```

The script prints one row per metric with its value and its score. Without `--relay`, the two relay rows show `(not run)` and do not count. The last line gives the lowest score and the mean score over the metrics that ran. When `.crew/` exists, the script also writes `.crew/rounds/perf-score.json`.

The script measures these metrics:

- **Bundle size.** The script bundles the `dist/index.js` file of each package for the browser, minifies it and compresses it with gzip. `react`, `react-dom` and the other `@anchor-presence` packages stay outside the bundle.
- **Wire size.** The script encodes one steady cursor message with `jsonCodec` and with `binaryCodec`. The message has three anchors, a mouse pointer, and a `clientId` and `session` of 12 characters each. The docs quote the four-anchor sizes of `packages/core/bench/hotpath.bench.ts`, so the two sets of numbers differ.
- **Hot paths.** The script runs the cases of `packages/core/bench/hotpath.bench.ts`. It reports the inbound path for each codec and `store.ingest` with 200 clients.
- **Heap per message.** The script ingests 500 rounds of messages from 200 clients and divides the heap growth by the message count.
- **Relay.** With `--relay`, the script runs `scripts/relay-load.ts` with 50 clients for 5 seconds. It does this three times and reports the median p99 latency and the median delivery ratio.

The budgets are in `scripts/perf-score.ts`. A metric scores 10 at or below the first limit, 9 at or below the second limit, and 7 at or below the third limit. Above all three limits, it scores 5. For the delivery ratio, a higher value is better, so the comparison is reversed.

| Metric                                     | 10           | 9          | 7          |
| ------------------------------------------ | ------------ | ---------- | ---------- |
| bundle core gzip (KB)                      | 7            | 9          | 13         |
| bundle dom gzip (KB)                       | 10           | 13         | 19         |
| bundle react gzip (KB)                     | 4            | 5          | 8          |
| wire json steady cursor (bytes)            | 220          | 300        | 420        |
| wire binary steady cursor (bytes)          | 80           | 110        | 160        |
| inbound binary path (us)                   | 3            | 6          | 12         |
| inbound json path (us)                     | 4            | 8          | 16         |
| store.ingest, 200 clients (us per message) | 0.5          | 1          | 3          |
| heap per ingested message (bytes)          | 64           | 256        | 1024       |
| relay p99 latency at 50 clients (ms)       | 15           | 50         | 120        |
| relay delivery ratio at 50 clients (%)     | 99.5 or more | 98 or more | 95 or more |

The bundle and wire sizes depend only on the code and the Bun version. The time, heap and relay values change with the machine and its load.

### Benchmark guard

`bun run bench` runs the core hot-path benchmarks and compares each mean with `packages/core/bench/baseline.json`. It fails when a case is more than 3 times slower than its baseline. CI runs it on every push to `main`. After an intended change in speed, write a new baseline:

```bash
bun run bench --update-baseline
```

### Measured at scale

The "Measured at scale" section of the performance guide comes from two opt-in local benchmarks. Neither runs in CI.

The receiver benchmark drives the demo bench page (`?page=bench`) at three sizes. It runs only on Chromium, and only when `PERF_SCALE=1` is set:

```bash
PERF_SCALE=1 bunx playwright test --project=chromium e2e/perf-scale.spec.ts
```

The relay benchmark starts `apps/server` and raises `RELAY_MAX_ROOM_SOCKETS` and `RELAY_MAX_TOTAL_SOCKETS` to fit the client count. Run it with the client counts and the duration in seconds:

```bash
bun run scripts/relay-load.ts --clients 50,100,200 --seconds 10
```

## Releasing

Versions are lockstep: one number for `core`, `dom`, and `react`. Never edit a package `version` by hand.

Release from `main`:

```bash
git checkout main && git merge dev
npm version patch
```

For a bigger jump, use `npm version minor` or `npm version major`. `npm version` runs three steps in order:

1. `preversion` runs the full gate: build, typecheck, lint, test.
2. The `version` hook syncs the version into every manifest and the lockfile, stages them, and creates the `v*` tag.
3. `postversion` pushes the branch and the tag.

The pushed `v*` tag starts `.github/workflows/release.yml`. The workflow verifies that the tag and the versions agree. Then it publishes each package with npm trusted publishing (OIDC, no token) and creates a GitHub release.

Trusted publishing is set up once per package on npmjs.com: package settings → Publishing access → add a Trusted Publisher → GitHub, repository `DammersCode/anchor-presence`, workflow `release.yml`. The first version of a package cannot use OIDC. Publish it once by hand from an authenticated machine, in the order core, dom, react. First run `bun run build` and `node scripts/check-release.mjs`. Then publish each package:

```bash
cd packages/core && npm publish --access public
```

If a run fails after a partial publish, fix the cause and run the workflow again. The workflow skips versions that are already published.

`npm version` needs a clean working tree and a passing gate. Without both, it stops.
