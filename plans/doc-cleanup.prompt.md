# Task: Clean up all project READMEs

Rewrite the style and structure of the six project README files. Do not change any
public API names, package names, commands, URLs, or code blocks that are meant to
run. Only change prose, section order, and diagram format.

## Files in scope

1. `README.md` (repository root)
2. `apps/demo/README.md`
3. `packages/core/README.md`
4. `packages/dom/README.md`
5. `packages/react/README.md`
6. `examples/socketio/README.md`
7. `examples/signalr/README.md`

Out of scope: `docs/*`, `SPECIFICATION.md`, `plans/*`, `PLAN.md`, `fix.plan.md`,
`REVIEW-*.md`, `skills/*`, `CONTRIBUTING.md`. Do not touch those files.

## Hard rules

1. No em-dash character "—" anywhere in the touched files. Replace each one with a
   comma, a period, or a rephrased sentence. After the edits, verify with a search
   for the literal character that zero remain (it is in every file today: title
   "Anchor Presence — Demo" in apps/demo, ~30+ total occurrences across the six
   package READMEs and root).
2. Simple English for a beginner. Short sentences. One idea per sentence. Plain
   words. Readable by a developer who has never seen this project and only wants
   to use it, not by a contributor writing the library.
3. No internal or process commentary. Remove lines that describe the project's
   governance or decisions, for example the sentence about a framework adapter
   being ruled out for now.
4. State requirements directly. Do not use the word "Evergreen". The browser
   requirement is simply: current versions of Chrome, Edge, Firefox, and
   Safari. State what is required, nothing more.
5. Any flow or sequence diagram must be Mermaid (GitHub renders
   ```mermaid blocks natively), never an ASCII art block in ```text fences.

## Per-file changes

### `README.md` (root)

- Restructure for a reader who just wants to use the library:
  1. Title and one-paragraph summary (what it is, what it does).
  2. A **Quick start** section with a complete minimal example: install the
     three packages, create a client with a transport, register one anchor with
     `useCursorAnchor`, render `<LiveCursorProvider>` and `<CursorLayer>`. Keep
     the existing code block as the basis; make sure the full flow from install
     to "cursor appears in the second window" is in one short section, with
     plain sentences between steps.
  3. **Requirements** table (small): React 18+, TypeScript 5.9+, browser
     current Chrome/Edge/Firefox/Safari, Bun to run the demo.
  4. **Packages** table (already a table; keep).
  5. **Features** (a few bullets, short lines; trim the narrative).
  6. **Docs** as a two-column table: file | what it covers. One row per docs
     file (architecture, concepts, responsive-layouts, ui-context, react,
     transports, codecs, performance, security, troubleshooting). This
     replaces the current bullet list.
  7. **Transport examples** section: short rows pointing at `apps/demo`,
     `apps/server`, `examples/socketio`, `examples/signalr`.
  8. Moving on / deeper reading at the end: the contract diagram, capability
     matrix, pick-by-intent tables, agent skill, contributing. These stay, but
     shorter.
- Convert the "The Contract" ASCII diagram (```text fence) to a Mermaid
  flowchart that preserves the meaning: sender sends anchor ID plus normalized
  position, codec encodes, transport carries it, receiver decodes, validates,
  measures its own anchor, resolves to pixels. Keep the sentence "The sender
  never measures the receiver's DOM" after it.
- Remove the "owner ruled it out" sentence under the capability matrix.
- Remove em-dashes from the tagline and section text.

### `apps/demo/README.md`

- Title: `# Anchor Presence Demo` (no em-dash). Keep the badge.
- Cut the paragraph that ends with "See SPECIFICATION.md ... for the full
  protocol"; a demo user does not need it. Leave at most one line: "The
  packages must be built before the demo runs."
- Keep: Run it, the two example URLs, What to try. Shorten the "What to try"
  items to one or two simple sentences each.
- Drop the `?interp` note detail about spring being demo-authored; one clause
  is enough.

### `packages/core/README.md`

- Keep it short (it is already close). One-paragraph "what it is", the example
  code block, boundary rule in two plain sentences, exports list.
- The exports list uses an em-dash after each name. Replace the format with a
  table: export | what it does.
- Trim the closing "See docs/..." line to a single line naming at most the two
  most relevant docs.

### `packages/dom/README.md`

- Same treatment as core: plain-paragraph intro, code block, exports as a
  table (export | what it does), no em-dashes.
- The "Binding options" paragraph is one long run-on sentence with nested
  lists. Split it into short sentences, one idea each.
- Trim the closing docs pointer to one line.

### `packages/react/README.md`

- Same treatment: intro, code block, exports as a table (hook or component |
  what it does), no em-dashes.
- Keep the `CursorLayer` section, but shorten the prose to what a user needs:
  it is optional, what props it takes, and that remote user data is untrusted.
- Keep the Install section near the top; it is the only package README that
  has one and it is the most useful for a beginner.
- "SSR-safe" / "server-safe snapshot" wording: keep the fact, drop the jargon.

### `examples/socketio/README.md`

- Mostly fine. Remove em-dashes if any, shorten the three-part description into
  a short list, keep the run commands.
- The "What the demo shows" section repeats the root README's core idea; keep at
  most two sentences and point to the root README.

### `examples/signalr/README.md`

- Same as socketio. Keep the prerequisites (they are genuinely required:
  .NET 10 SDK, Bun), keep run commands, keep the validation and stale-cursor
  notes but shorten them.

## Verification

- Search all six files for the em-dash character; zero matches.
- `bun run typecheck` and `bun run test` must still pass (README-only changes
  should not break them; run them to be safe).
- Read each README top to bottom as a first-timer: if a section assumes you
  read another file first, add one plain sentence that says what the library
  does instead.
- Check every relative link still resolves (docs files live at repo root under
  `docs/`; package READMEs are at `packages/<name>/`, so links there use
  `../../docs/...`).
