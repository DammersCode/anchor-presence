# 043 Production-ready API and docs

Status: done. Steps 1 and 2 done. Steps 3 and 4 ran for nine scoring rounds and stopped on a plateau with no open P1 or P2 row; the P3 rows stay in the ledgers. Rubric: [research/api-scoring-rubric.md](research/api-scoring-rubric.md).

Steps, each with its completion criterion:

1. Docs page actions: copy and "Open in" popover with GitHub, Markdown, Scira, ChatGPT, Claude, Cursor. Criterion: popover lists six links in the browser, docs typecheck green.
2. Vercel `ignoreCommand`: skip builds when no docs, package, example or lockfile change. Criterion: a plans-only commit exits 0, a packages commit exits 1. Removed later: the owner manages the build settings in Vercel.
3. Scoring loop for areas A and B: fresh opus scorer, gap list, fixes, demo use, rescore. Criterion: all dimensions 9 or more or a stop rule fires.
4. Scoring loop for area C after the API settles. Criterion: same.

Rules: breaking changes are welcome (no public users). One push and one merge per round, after green gates. No tags, releases or publish.
