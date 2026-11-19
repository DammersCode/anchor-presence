# Layout audit skill: token score and A/B run

## Method

Task: take a jumpy UI and make every viewport pair of the audit score below 25, at 390, 768, 1280 and 1440 px. The brief called this the low band, but the low band ends at 20. The table marks runs by the real band. Each run got one skill variant and one fixture. A Sonnet agent ran each, with a limit of four measure runs. The scores below come from a second, independent measure of the final files. Token numbers are the total of each subagent run.

| Variant | Skill files                            | Skill size (tokens, 4 chars each) |
| ------- | -------------------------------------- | --------------------------------: |
| A       | SKILL.md, scoring.md, fixes.md, config |                             7,300 |
| B       | without scoring.md                     |                             4,600 |
| C       | without fixes.md                       |                             5,900 |
| D       | SKILL.md and scripts only              |                             3,100 |

Fixtures: `dashboard` (must stay usable, any layout allowed) and `shop` (must still adapt to the width).

## Results

| Run         | Measure runs | Worst pair (independent) | Band     | Run tokens |
| ----------- | -----------: | -----------------------: | -------- | ---------: |
| dashboard A |            2 |                       15 | low      |        72k |
| dashboard B |            2 |                       15 | low      |        72k |
| dashboard C |            2 |                        2 | low      |        76k |
| dashboard D |            2 |                       15 | low      |        70k |
| shop A      |            2 |                       23 | moderate |        78k |
| shop B      |            4 |                      100 | high     |        81k |
| shop C      |            2 |                       20 | low      |        77k |
| shop D      |            4 |                       22 | moderate |        77k |

## What the runs show

- The dashboard does not tell the variants apart. All four ended with a layout that is the same at every width.
- Only variant C passed the shop. Its answer was a fixed two-column grid with every size in `em` and a root font size that scales with the viewport.
- Shop A passed its own check only through a gap trick. It set every gap to 32 px, which is above the 24 px adjacency limit, so neighbors no longer count. The cursors do not get calmer. The audit cannot see this. The skill now says so.
- Shop B lost two of its four measure runs to edits that did not apply. That is tool noise and not a skill effect.
- Shop D misread the band: it read 22 as "low". Without `scoring.md` the agent had no band table. The skill now carries the band table in `SKILL.md`.
- Run tokens differ by at most 15 percent between the cheapest and the dearest run of one fixture. The skill files are about 3 to 7 thousand tokens of a run of about 75 thousand. A cut of one skill file does not show in the run total.

## Decisions

- Keep all files. Eight runs with one sample each cannot prove that a file is dead weight, and the cost of `scoring.md` (2.7k tokens) is below the noise of the run.
- Move the band table into `SKILL.md` (four lines), so a run that skips `scoring.md` still reads the bands right.
- Add a short warning about two ways to lower the score without calming the cursors: gaps wider than `adjacencyPx`, and a layout that does not adapt at all.
- Add `scan.mjs`. It replaces a manual search in step 1.

## Limits

One run per cell. One model. Agents did not look at the pages. The field-test fixtures are small, and the stable recipe there (fixed 358 px panels in a wrapping container) gives wide screens no extra content.
