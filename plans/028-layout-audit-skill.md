# 028 Layout audit skill and layout design guide

Status: done · Branch: `dev` · Research: [research/presence-layout-audit.md](research/presence-layout-audit.md) · Dogfood: [research/presence-layout-audit-dogfood.md](research/presence-layout-audit-dogfood.md)

## Outcome

- Skill: `skills/anchor-presence-audit/` (`SKILL.md`, `scoring.md`, `fixes.md`, `audit.config.example.json`, `scripts/measure.mjs`, `scripts/score.mjs`, `scripts/report.mjs`). The scoring follows the research "Coordinator correction" formula; `scoring.md` holds the definitions and the aggregation per input.
- Unit tests for the pure scoring: `test/audit-skill/score.test.mjs` (vitest project `audit-skill`).
- Docs: `get-started/guides/layout-design.mdx`, an audit section in `get-started/guides/ai-agents.mdx`, a link from the troubleshooting jump symptom.
- Dogfood: the eight docs example scenes, scored and checked against each scene's intent. Two metric corrections came out of it (clipped content, corner-only neighbors); the basics result contradicted the expectation and was confirmed against the live library.
