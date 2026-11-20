# Release workflow hardening

Status: open. The patch below is a proposal; `.github/workflows/release.yml` is unchanged until the owner applies it and finishes the GitHub and npm setup.

## Problems in the current `release.yml`

- One job holds `contents: write`, `id-token: write` and `actions: read` for every step, including `bun install` and the build. A compromised dependency install script can push to the repo and mint an npm OIDC token.
- No environment: a pushed `v*` tag publishes with no human approval.
- `actions/checkout` keeps the token on the runner for every later step.
- The main-run lookup matches any `main.yml` run for the SHA, also a `workflow_dispatch` run on another branch.
- `npm install -g npm@latest` installs whatever is latest at release time.
- `bun install` runs the workspaces' own lifecycle scripts (the docs `postinstall`) and those of trusted dependencies, none of which the package build needs.
- `npm view @dammers/anchor-presence-core@${GITHUB_REF_NAME#v}` is unquoted.
- Third-party actions are pinned to movable major tags.

## Patch

Three jobs: `gate` (read-only, waits for green main checks), `publish` (environment `npm-release`, OIDC only), `release` (creates the GitHub release, `contents: write` only).

Action SHAs were looked up on 2026-11-18 with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`; each major tag pointed at the commit of the release named in the comment. npm 11.21.3 is the newest 11.x (`npm view npm@11 version`).

Locally (Bun 1.4.4, over an existing `node_modules`), `bun install --frozen-lockfile --ignore-scripts` reported no changes and `bun run build` passed. That shows the lockfile is consistent; a clean scriptless install is not yet proven. The package build is plain `tsc --build`.

```yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: read
jobs:
  gate:
    name: Wait for green main checks on the tagged commit
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    permissions:
      actions: read
      checks: read
    steps:
      # Checks run once on main; the release waits for that run instead of repeating it.
      # npm version pushes the commit and the tag together, so the run can still be in progress here.
      - name: Wait for green main checks on the tagged commit
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          for attempt in $(seq 1 30); do
            id=$(gh run list --repo "$GITHUB_REPOSITORY" --workflow main.yml --branch main --event push --commit "$GITHUB_SHA" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
            [ -n "$id" ] && break
            sleep 10
          done
          test -n "$id" || { echo "::error::No Main checks push run on main for $GITHUB_SHA. Tag a commit that was pushed to main."; exit 1; }
          gh run watch "$id" --repo "$GITHUB_REPOSITORY" --exit-status --interval 30

  publish:
    name: Publish to npm
    needs: gate
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    environment: npm-release
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: 1.3.14
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      # trusted publishing (OIDC) needs npm >= 11.5.1; Node 22 ships older
      - name: Update npm
        run: npm install -g npm@11.21.3
      - name: Install dependencies
        run: bun install --frozen-lockfile --ignore-scripts
      - name: Build packages
        run: bun run build
      - name: Check the tag matches the package versions
        run: node scripts/check-release.mjs "$GITHUB_REF_NAME"
      # npm view makes each publish idempotent: a re-run publishes only what is missing
      - name: Publish @dammers/anchor-presence-core
        run: npm view "@dammers/anchor-presence-core@${GITHUB_REF_NAME#v}" version 2>/dev/null || (cd packages/core && npm publish --provenance --access public)
      - name: Publish @dammers/anchor-presence-dom
        run: npm view "@dammers/anchor-presence-dom@${GITHUB_REF_NAME#v}" version 2>/dev/null || (cd packages/dom && npm publish --provenance --access public)
      - name: Publish @dammers/anchor-presence-react
        run: npm view "@dammers/anchor-presence-react@${GITHUB_REF_NAME#v}" version 2>/dev/null || (cd packages/react && npm publish --provenance --access public)

  release:
    name: Create the GitHub release
    needs: publish
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      contents: write
    steps:
      - name: Create the GitHub release
        uses: softprops/action-gh-release@8a0cd651e5b2365bd640854a3fa5dfc70e4875f3 # v3.0.4
        with:
          generate_release_notes: true
```

A job-level `permissions` block replaces the top-level one, so every job lists all it needs. `gate` needs no checkout: `gh run` reads the repo through `--repo`.

## Owner setup in GitHub and npm

1. GitHub, Settings > Environments: create `npm-release`. Add yourself as a required reviewer. Under deployment branches and tags, allow only tags that match `v*`.
2. npmjs.com, for each of `@dammers/anchor-presence-core`, `@dammers/anchor-presence-dom` and `@dammers/anchor-presence-react`: Settings > Trusted publishing > GitHub Actions. Organization or user `DammersCode`, repository `anchor-presence`, workflow filename `release.yml`, environment `npm-release`.
3. After the first release through trusted publishing: set each package's publishing access to "Require two-factor authentication and disallow tokens", and delete any `NPM_TOKEN` secret from the repo.
4. Optional: Settings > Actions > General: allow only actions pinned to a full commit SHA. First pin every action in `pr.yml`, `main.yml` and the setup action to a full SHA, or those workflows fail.

## Open checks

- `--frozen-lockfile` was verified with Bun 1.4.4 only; CI pins Bun 1.3.14.
- A clean `bun install --frozen-lockfile --ignore-scripts` on an empty runner, then `bun run build`, is not yet run.
- `gh run watch` needs `checks: read` as well as `actions: read`; the `gate` job grants both. No release run has proven this step yet.
- A first release must confirm that the `npm-release` environment name in the npm trusted publisher matches the job, otherwise `npm publish` fails with a 404 on the OIDC exchange.
- Dependabot or Renovate should bump the pinned SHAs; without a bot they go stale.
