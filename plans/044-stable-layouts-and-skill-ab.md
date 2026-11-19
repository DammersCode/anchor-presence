# 044 Stable layouts, demo notes, and skill A/B

Status: done · Branch: `develop` · Builds on [028](028-layout-audit-skill.md) and the [dogfood](research/presence-layout-audit-dogfood.md).

## Goal

- Example pages say when their demo breaks the layout rules on purpose, and where the stable pattern lives.
- A new demo shows one UI that stays calm at every viewport.
- A field test covers many UI types, each in a jumpy and a stable form, measured with the audit scripts.
- The audit skill gets better guidance and a design-time check. Its parts are scored for tokens and cut where an A/B run shows no loss.

## Steps

1. Notes: a `LayoutNote` on the pages whose scene scores high in the dogfood (basics, responsive-grid, presence-list, custom-cursor-rendering, table-and-cards, anchors-and-fallbacks). Kanban stays the model.
2. Demo: a `stable-layout` scene and an example page that explain why it holds at every size.
3. Field test: fixtures for common UI types (dashboard, form, settings, pricing, article, gallery, chat, sidebar app), each with a `jumpy` and a `stable` variant, measured at five viewports.
4. Skill: add a fast design-time check script, and fold the field-test lessons into `fixes.md`.
5. Token score: tokens per skill file and per task.
6. A/B: run the same fix task with the full skill and with a part removed. Compare the audit score after the fix and the tokens used. Cut a part only when the score holds.

## Done when

- Gates pass (see AGENTS.md).
- The field test report lists every fixture, viewport, and score, and every stable variant scores low.
- The A/B table states which skill parts were cut and which were kept, with the evidence.

## Outcome

- Demo notes on six example pages, and the Stable layout example (audit score 4, against 100 for Basics).
- Field test: `apps/demo/src/field-test/` and [research/field-test](research/field-test/README.md). Every stable variant scores 18 or lower, every jumpy variant 100.
- Skill: `scan.mjs`, `ANCHOR_AUDIT_BROWSER`, the band table in `SKILL.md`, and a warning about fixes that only lower the score.
- A/B and token score: [research/skill-ab/results.md](research/skill-ab/results.md). No skill file was cut, because one run per cell cannot show a file is dead weight.
- Docs navigation: [rubric](research/docs-navigation-rubric.md). Beginner and expert both reached 9.0 in every dimension after nine fix rounds. The first six reader reports are in `research/docs-nav/`.
- Open idea: a per-element opt-out for pointer capture. The binding has no such option today, and the docs state the limit.
