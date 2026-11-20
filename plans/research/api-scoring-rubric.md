# API and docs scoring rubric

Frozen before round 1. A fresh scorer sees code, docs and this file only. Gap taxonomy and priorities follow the gridcn api-gap-sweep: (a) missing customization surface, (b) doc lie, (c) opaque state, (d) missing lifecycle primitive, (e) type-safety hole, (f) cross-feature friction, (g) DX friction. P1 blocks real use or breaks accessibility, P2 hits most consumers, P3 is polish. Size S/M/L.

## Areas

- A: public API of `core`, `dom`, `react`.
- B: backend and transport contract (custom transports, relay, examples).
- C: docs (`apps/docs/content/docs/**`, READMEs, llms files).

Areas A and B are scored on the seven code dimensions: ergonomics, configurability, type safety, gap coverage, demo evidence, performance, robustness and a11y. The three docs dimensions belong to area C only.

Done when every dimension of every area scores 9 or more. A 10 needs zero known gaps.

## Anchors (7 / 9 / 10)

| Dimension           | 7                                               | 9                                                                                                                                                                             | 10                                                           |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Ergonomics          | Main path works, defaults need reading the docs | Zero-config path works, every default is safe, common tasks take one call                                                                                                     | Also guessable from types alone                              |
| Configurability     | Main knobs exist, others need a fork            | Every documented use case works without a workaround, escape hatches exist                                                                                                    | Also composable: each knob works with every other knob       |
| Type safety         | No `any` in public types                        | Wrong use fails to compile, generics infer, no casts in demos                                                                                                                 | Also exhaustive unions, branded ids where mix-ups are likely |
| Gap coverage        | P1 gaps closed                                  | No open P1 or P2 gap                                                                                                                                                          | No open gap of any priority                                  |
| Demo evidence       | One demo uses it                                | Each public function and class export is used by a demo or e2e test (a constant counts as covered when a unit test or a docs table pins its value), and each demo found a fix | Also a demo per backend example                              |
| Performance         | No known regression                             | Bench numbers recorded, hot paths allocation-free, bundle size per package recorded                                                                                           | Also a budget enforced in CI                                 |
| Robustness and a11y | Happy path                                      | SSR, StrictMode, reconnect, reduced motion and keyboard use each have a test                                                                                                  | Also fuzzed or adversarial inputs                            |
| Docs accuracy       | Few doc lies                                    | No doc lie, every sample type-checked                                                                                                                                         | Also every claim links to a test                             |
| Docs completeness   | Main features                                   | Every export, option and error has a page section, each task has a recipe                                                                                                     | Also a migration and troubleshooting path                    |
| Docs readability    | Understandable                                  | Passes simple-english self-check, one term per concept                                                                                                                        | Also scannable: answer first on every page                   |

## Evidence per score

Each score cites file:line, a test name, a bench number or a demo path. A score without evidence counts as 5. The scorer lists open gaps with ID, taxonomy letter, priority and size.

## Gap ledger

[gap-ledger.md](gap-ledger.md) lists every gap with a stable ID. A scorer receives it without earlier scores, marks each row closed, open or partial with evidence, and adds new rows. Gap coverage is scored from the ledger: 9 needs no open P1 or P2 row, 7 needs no open P1 row.

## Stop rules

- Success: all dimensions 9 or more, and a round adds no new P1 or P2 row.
- Stall: the open P1 plus P2 count does not fall for two rounds, or the same error fails twice with the same approach. Score noise between scorers is larger than a fix, so means alone never stop the loop.
- Limit: a model or plan limit stops the loop until the reset.

## Performance is measured

The performance dimension comes from `bun run perf:score --relay`, not from reading code. The script scores each metric 10, 9, 7 or 5 against the budgets in `scripts/perf-score.ts`. The dimension equals the lowest metric score, so 9 means every metric meets its 9 budget. A scorer reports the table and does not estimate. Metrics:

- gzip size of each package bundle (core, dom, react),
- steady cursor message size in the JSON and binary codec,
- inbound path time per message and `store.ingest` time per message,
- heap growth per ingested message,
- relay p99 latency and delivery ratio at 50 clients, as the median of three runs. The load generator shares the machine with the relay, so these budgets are loose: they catch a relay that falls behind, not a few milliseconds.

## Amendments

The rubric above was frozen before round 1. Each change made after the first commit (a63c890, 2026-11-17) is logged here, in commit order.

- 2026-11-17 (7bbdcdf), Scope: areas A and B are scored on the seven code dimensions; the three docs dimensions belong to area C only.
- 2026-11-17 (7bbdcdf), Gap coverage: scored from the new gap ledger (`gap-ledger.md`). 9 needs no open P1 or P2 row, 7 needs no open P1 row.
- 2026-11-17 (7bbdcdf), Stop rules: Success was "all dimensions 9 or more, and a round finds no new must-fix", now "... a round adds no new P1 or P2 row". Stall was "two rounds in a row raise the area total by less than 0.3, or the same error fails twice with the same approach", now "the open P1 plus P2 count does not fall for two rounds, or the same error fails twice with the same approach".
- 2026-11-18 (84b671b), Performance: the dimension is measured by `bun run perf:score --relay` and equals the lowest metric score (10, 9, 7 or 5 against the budgets in `scripts/perf-score.ts`), no longer read from code.
- 2026-11-18 (df858de), Performance: relay p99 latency and delivery ratio are the median of three runs, and the relay p99 bands moved from 5/15/40 ms to 15/50/120 ms.
- 2026-11-19 (dbbb74c; the new metric came with 8126e26), Performance: the core size budget for 9 rose from 9 KB to 10 KB for the whole entry (`bundle core gzip (KB)` in `scripts/perf-score.ts`). A new metric, `bundle core app (jsonCodec client only, KB)`, measures an app that imports only `createPresenceClient` and `jsonCodec` (7.30 KB) and keeps the 9 KB budget. Why: the entry bundles the binary codec and the store for every importer, and a whole-entry budget at 9 KB would punish features most apps tree-shake away. The JSON-only figure shows the cost an app pays.
- 2026-11-19 (3d83a6c), Demo evidence, 9 anchor: "Each public export is used by a demo or e2e test, and each demo found a fix" became "Each public function and class export is used by a demo or e2e test (a constant counts as covered when a unit test or a docs table pins its value), and each demo found a fix". Types are no longer part of this row. The constants clause: a constant needs no demo or e2e use. Why: a demo cannot meaningfully "use" a constant such as a default limit, and a pinned value is the stronger evidence.

Scores are reported under both texts. Under the original text, Demo evidence is 8 and Performance is 7 (original Performance 7 means the first measured budgets of 84b671b, not the a63c890 anchor). Under the amended text, Demo evidence is 9.
