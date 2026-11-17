# API and docs scoring rubric

Frozen before round 1. A fresh scorer sees code, docs and this file only. Gap taxonomy and priorities follow the gridcn api-gap-sweep: (a) missing customization surface, (b) doc lie, (c) opaque state, (d) missing lifecycle primitive, (e) type-safety hole, (f) cross-feature friction, (g) DX friction. P1 blocks real use or breaks accessibility, P2 hits most consumers, P3 is polish. Size S/M/L.

## Areas

- A: public API of `core`, `dom`, `react`.
- B: backend and transport contract (custom transports, relay, examples).
- C: docs (`apps/docs/content/docs/**`, READMEs, llms files).

Done when every dimension of every area scores 9 or more. A 10 needs zero known gaps.

## Anchors (7 / 9 / 10)

| Dimension           | 7                                               | 9                                                                                   | 10                                                           |
| ------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Ergonomics          | Main path works, defaults need reading the docs | Zero-config path works, every default is safe, common tasks take one call           | Also guessable from types alone                              |
| Configurability     | Main knobs exist, others need a fork            | Every documented use case works without a workaround, escape hatches exist          | Also composable: each knob works with every other knob       |
| Type safety         | No `any` in public types                        | Wrong use fails to compile, generics infer, no casts in demos                       | Also exhaustive unions, branded ids where mix-ups are likely |
| Gap coverage        | P1 gaps closed                                  | No open P1 or P2 gap                                                                | No open gap of any priority                                  |
| Demo evidence       | One demo uses it                                | Each public export is used by a demo or e2e test, and each demo found a fix         | Also a demo per backend example                              |
| Performance         | No known regression                             | Bench numbers recorded, hot paths allocation-free, bundle size per package recorded | Also a budget enforced in CI                                 |
| Robustness and a11y | Happy path                                      | SSR, StrictMode, reconnect, reduced motion and keyboard use each have a test        | Also fuzzed or adversarial inputs                            |
| Docs accuracy       | Few doc lies                                    | No doc lie, every sample type-checked                                               | Also every claim links to a test                             |
| Docs completeness   | Main features                                   | Every export, option and error has a page section, each task has a recipe           | Also a migration and troubleshooting path                    |
| Docs readability    | Understandable                                  | Passes simple-english self-check, one term per concept                              | Also scannable: answer first on every page                   |

## Evidence per score

Each score cites file:line, a test name, a bench number or a demo path. A score without evidence counts as 5. The scorer lists open gaps with ID, taxonomy letter, priority and size.

## Stop rules

- Success: all dimensions 9 or more, and a round finds no new must-fix.
- Stall: two rounds in a row raise the area total by less than 0.3, or the same error fails twice with the same approach.
- Limit: a model or plan limit stops the loop until the reset.
