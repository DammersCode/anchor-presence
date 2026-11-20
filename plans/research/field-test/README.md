# Layout audit field test

Eight common UIs, each built twice in `apps/demo/src/field-test/`: a `jumpy` naive responsive version and a `stable` redesign. Open one at `/?page=field-test&ui=<ui>&variant=<jumpy|stable>`.

Measured with `skills/anchor-presence-audit` at 390, 768, 1280 and 1440 px (height 900), `jumpScale: "viewport"`, 6 pairs per variant. Config: `audit.config.json` (made by `gen-config.mjs`). Raw scores: `result.json`.

| ui        | variant | worst pair total | worst sub-score        |
| --------- | ------- | ---------------: | ---------------------- |
| dashboard | jumpy   |              100 | Jump 100               |
| dashboard | stable  |                0 | none                   |
| settings  | jumpy   |              100 | Jump 100               |
| settings  | stable  |                3 | Jump 3                 |
| pricing   | jumpy   |              100 | Jump 100               |
| pricing   | stable  |               15 | Aspect 100 (container) |
| article   | jumpy   |              100 | Jump 100               |
| article   | stable  |                3 | Jump 3                 |
| gallery   | jumpy   |              100 | Jump 100               |
| gallery   | stable  |                3 | Jump 3                 |
| chat      | jumpy   |              100 | Jump 100               |
| chat      | stable  |                3 | Jump 3                 |
| shop      | jumpy   |              100 | Jump 100               |
| shop      | stable  |               18 | Jump 18                |
| admin     | jumpy   |              100 | Jump 100               |
| admin     | stable  |                0 | none                   |

## What changed

Every stable UI uses one recipe: fixed-size panels (358 px wide, the content width of a 390 px phone) in a `flex-wrap` container with 32 px gaps. Extra room holds more panels beside each other. Content inside a panel never reflows. The container has its own anchor, so a pointer in a gap resolves to it.

- **dashboard**: Jumpy stacks stats, switches 1/2/4 columns and hides table columns on phones. Stable keeps 173 px stat tiles, a 358 px chart and a table that scrolls sideways with all columns.
- **settings**: Jumpy turns a 3-column label/input grid into a stack and stretches the buttons. Stable stacks label over input in every view and uses fixed 112 px buttons.
- **pricing**: Jumpy goes from 3 columns to 1 and stretches the buttons. Stable uses 358 px plan cards and fixed-width buttons. The 15 comes from the plans container changing shape (Aspect), not from any pointer jump.
- **article**: Jumpy moves the sidebar under the article on phones and makes its button full width. Stable keeps article and sidebar as two panels that wrap, with fixed-size tags and links.
- **gallery**: Jumpy changes 2/3/6 columns and gives every fifth photo a wide shape. Stable keeps 173 px square photos in two 6-photo panels.
- **chat**: Jumpy stacks the list above the thread on phones and stretches the composer. Stable keeps both as panels with fixed-width bubbles, input and button.
- **shop**: Jumpy hides the filters on phones and changes 1/2/4 columns. Stable keeps filters visible as fixed chips and the grid at 2 fixed cards per row. The 18 comes from small differences inside a product card.
- **admin**: Jumpy turns the sidebar into a top bar, then icons, then labels, and hides columns. Stable keeps the same nav tiles and a scrolling table with all columns.

## Limits

- The gap between panels must stay above the audit's 24 px adjacency limit. Smaller gaps make neighbors that regroup between views, and Jump rises.
- Panels do not use wide screens in a new way: a 1440 px view shows the same panels, only side by side. A page with a dense table gets no extra width for the table.
