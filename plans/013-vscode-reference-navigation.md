# Plan 013: Fix reference navigation (F12 / Go to References) in the VS Code tooling

> **Executor instructions**: Execute phases 1-3 in order. Each phase ends with the
> verification step. On a STOP condition, stop and report. Update the status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat HEAD -- .vscode`
> Expect: no `.vscode` directory before this plan.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (workspace config + docs only; no source changes)
- **Depends on**: nothing
- **Category**: developer-experience
- **Planned at**: commit `9cb121a`, 2026-08-31

## Why this matters

Reference navigation (F12 Go to Definition, Shift+F12 Go to References, Ctrl+Click,
Find All References) stopped working for the owner. A diagnosis on 2026-08-31 found:

- The TypeScript language server inside VS Code answers reference queries correctly
  across the whole workspace (verified: 8 usages of `LiveCursorProvider` across
  `packages/react`, `examples/signalr`, `apps/demo`).
- No `keybindings.json` exists (default keybindings apply). No F12 remap.
- No `.vscode/` folder existed, so no editor settings, no `search.exclude` /
  `files.watcherExclude` overrides.
- Workspace package links are intact (`apps/demo/node_modules/@anchor-presence/*`
  symlinks to `packages/*`; `dist/index.d.ts` present in all three packages).
- **The active VS Code window was the Welcome page (no folder open).** Reference
  commands need a folder open; on the Welcome page they do nothing.
- The two e2e artifact folders (`test-results/`, `playwright-report/`) hold
  hundreds of files and feed the Windows file watcher and the search index. They are
  gitignored build output and should stay out of both.
- The workspace TypeScript is not pinned. VS Code may load its bundled TypeScript.
  Plan 005 documents TS 6/7 changes in ambient-global type acquisition; CI and local
  verification all pass with the workspace TypeScript 5.9.3. Pinning the editor to
  the same version keeps editor behavior identical to CI.

## Phases

### Phase 1: Open the folder in a working window (owner action)

Open this repository in a VS Code folder window. From the repository root:

```sh
code .
```

Or: File > Open Folder > `c:\repos\danny\anchor presence`. Close stray Welcome
windows. If F12 then works, the cause was the Welcome-page window and this plan is
done at Phase 1.

**Note for laptops**: many keyboards use F1-F12 as a second media-function row. If
the physical F12 key controls a system function (WiFi, brightness), press
`Fn+F12`. Switch the key row to function-key mode in BIOS/Firmware ("Action Mode" /
"Hotkey Mode") or use `Shift+F12` and `Ctrl+Click` as alternatives.

### Phase 2: Add `.vscode/settings.json` (watcher + search exclusions + TS pin)

Create `.vscode/settings.json`:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.watcherExclude": {
    "**/test-results/**": true,
    "**/playwright-report/**": true,
    "**/.bun/**": true
  },
  "search.exclude": {
    "**/test-results/**": true,
    "**/playwright-report/**": true
  }
}
```

Verification: open a `packages/core/src/*.ts` file. F12 on a core export jumps to the
definition. Shift+F12 lists cross-package usages. The editor status bar shows the
TypeScript version `5.9.3`.

### Phase 3: Add `.vscode/tasks.json` (standard tasks as F7 / Task runner entries)

Create `.vscode/tasks.json` with tasks for `bun run typecheck`, `bun run test`,
`bun run test:browser`, and `bun run build` (shell tasks, `$tsc` problem matcher on
typecheck). Verification: Terminal > Run Task lists all four.

### Gate

| Command | Expected |
|---|---|
| `git status --short` | only `.vscode/`, `plans/README.md`, and this file |
| F12 / Shift+F12 in `packages/core`/`apps/demo` (editor) | navigates, no "No definitions found" |
| `bun run typecheck` | exit 0 (the tsdk pin must not break the editor; terminal tsc unchanged) |

## Scope

**In scope**: `.vscode/settings.json`, `.vscode/tasks.json`, `plans/README.md`
(status row), this plan.
**Out of scope**: user-level VS Code settings, keybindings, extensions, the source
tree.

## STOP conditions

- If F12 still does nothing inside a folder window after Phase 1-2: the cause is
  outside the workspace (keyboard Fn behavior, an extension, or a VS Code
  install-level issue). Report the exact symptom (nothing happens / spinner /
  "No definitions found") and stop. Do not change user settings.
- If the editor reports a TypeScript version different from 5.9.3 after the pin and
  navigation degrades, revert the `typescript.tsdk` line only (watcher exclusions
  stay).
