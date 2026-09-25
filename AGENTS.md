# Agent rules for anchor-presence

## Language

Everything in this repo is written in English: code, comments, docs, plans, research notes, changelog, commit messages, and PR text. Write new content in English; translate content found in another language.

## Package boundaries

- `@anchor-presence/core`: protocol, codecs, client, store. No DOM, no React, no runtime dependencies.
- `@anchor-presence/dom`: anchors, pointer capture, resolver, native `WebSocket` transport. No React.
- `@anchor-presence/react`: provider, hooks, cursor components.
- A transport that needs a third-party library (Socket.IO, SignalR, Elysia, Hono, `ws`) lives in `examples/`, never in a package.
- The public API is what each package's `src/index.ts` exports. `test/public-api.test.ts` pins it; update both together.

## Code comments

Write a comment only when the code cannot say it. The code says _what_; the comment says the _why_ the code cannot express.

- Default: no comment. A good name or structure beats any comment.
- Add a comment only for: a non-obvious constraint outside the code (browser quirk, platform limit, an invariant the types cannot express); a workaround for an external bug (name the bug); a deliberate simplification and its ceiling (state the upgrade path); a public API's semantics the signature does not show (JSDoc).
- Delete instead of writing: restatements of the next line; pointers to other code; history ("used to ..."); references to plans, findings, or advisor IDs; commented-out code.
- One idea per comment, at most 25 words, one line. Active voice, condition before statement.
- JSDoc (`/**`) documents the API for its users; keep it one line where the API allows it.
- Test names carry the spec. Comment a test only for non-obvious setup.

## Docs (`apps/docs/content/docs/**`, `README.md`, package READMEs)

Write docs prose with the `simple-english` skill (`.agents/skills/simple-english`): short sentences, conditions before commands, one term per concept, no hedges. Run its self-check before you deliver.

The reader is external. They never saw our plans, our alternatives, or our IDE:

- State what a feature does, never how its shape was decided. No rejected alternatives.
- Timeless: no "now", "new", "currently", "latest", "soon". `CHANGELOG.md` is the place for "new".
- Introduce a code sample with one sentence that ends in a colon. Mark omissions with a comment in the sample's language, never `...`.
- Numbered lists only when order matters. Never a one-item list.
- Every code sample in the docs must compile against the current API. Samples that a test cannot import get a type-checked copy under `apps/docs` or `packages/react/test/doc-samples.test.tsx`.
- Warnings use `<Callout type="warn">`: condition first, then the risk.

Example pages (`content/docs/examples/**`) follow this order: one-paragraph problem statement, live demo, install command, code tabs (client, server), behavior notes, `## Related` links.

## Workflow

### Gates

All green before committing. Run in order:

1. `bun run build`
2. `bun run typecheck`
3. `bun run format:check` (run `bun run format` to fix)
4. `bun run lint`
5. `bun run test`
6. `bunx playwright test --project=chromium` for changes in `packages/dom`, `packages/react`, `apps/demo`, or `e2e/`

A single failed browser test: rerun that file once before you debug it. Still red on the rerun means a real failure.

### Branches and commits

- Work on `dev`. A merge to `main` triggers CI and the docs deploy; merge only when the user asks.
- Worktrees for parallel work branch from `dev`, not `main`.
- Plain, descriptive, lowercase commit subjects (see `git log`). Never add a `Co-Authored-By` trailer.
- Push only when the user asks.

### Changelog

A user-facing change to a package (behavior, API, new export) gets an entry under `## Unreleased` in `CHANGELOG.md` in the same commit. Docs prose and test-only changes get no entry.

### Plans

Non-trivial work gets a short plan in `plans/` before implementation. `plans/README.md` is the index: one line per plan with its status. Delete a plan's body once it is done and its outcome is in the code, docs, or changelog.

## Skills

Repo-local skills live in `.agents/skills/`:

- `simple-english`: all docs prose.
- `security-and-hardening`, `security-review`, `websocket-engineer`: relay, transport, and protocol changes.
- `playwright-best-practices`: `e2e/` tests.
- `agent-browser`: manual checks of the demo and docs site.
- `find-skills`: find more skills.

`skills/anchor-presence/` is the skill we ship to users of the library, not a skill for this repo.
