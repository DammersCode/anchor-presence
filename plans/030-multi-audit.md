# 030 Multi-perspective audit and competitor research

Status: done (merged to `main` as PR #6) · Branch: `audit-improvements`

Owner request (2026-09-28): run an audit with multiple auditors from different perspectives (performance, DX, UX, API design, customization, usability/accessibility) over the whole repo, plus a research fleet that surveys the competition (Liveblocks, PartyKit, Yjs awareness, tldraw, Ably, npm alternatives) and alternatives to our element-addressing approach. Breaking changes are allowed. Goal: the best possible API, performance, and customization, with no usability pain for users. Deliverable: a reviewable list — findings, applied changes, and a competitor comparison (what they do that we do not, what we do that they do not).

## Approach

- Six read-only audit sub-agents scan the repo in parallel, one perspective each. Read-only on purpose: concurrent edits to shared packages collide; the main agent applies the selected fixes sequentially.
- Three research sub-agents survey the competition with their docs (web), structured as: features they offer that we lack, where we are stronger, alternatives.
- Selection rule for implementation: P0/P1 findings with small-to-medium effort and clear user value. Breaking changes get a CHANGELOG entry under Unreleased and an updated public-api pin.
- Outcome lands in `research/multi-perspective-audit.md` (reviewable list).

## Steps

The implementation is split into small sequential steps, one commit each (gates before each commit): `031` dev-mode detection, `032` autoConnect default, `033` provider owns the client (breaking), `034` store active-cursor count, `035` pointer hot path + touch/focus + presence-only, `036` resolver frame hot path, `037` React render cost + z-index, `038` demo polish, `039` e2e coverage, `040` docs/skills/changelog, `041` final list + PR. Steps 038-039 depend on 035 and 037; 040 follows 033.
