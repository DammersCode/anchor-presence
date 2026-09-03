# Task: File-Split Wave (A + B) — interne Seams, öffentliche APIs gefroren

Spec vom 2026-09-03. Basis: dev @ db7c2b1 (TS 7.0.2, 406/406 Tests, 0 Lint-Warnings).
Prinzip (codebase-design Skill): tiefe Module behalten ihr kleines Interface; die
größen- und verantwortungsbedingten Probleme bekommen INTERNE Seams. Kein
public-API-Change, keine neuen Dependencies, keine Verhaltensänderung.

## Gefrorene Public API (publicApi-Pins dürfen NICHT editiert werden)
- core: createPresenceClient, PresenceClient, PresenceClientOptions,
  AdaptivePublishOptions, SchedulerLike, DEFAULT_PUBLISH_INTERVAL_MS,
  DEFAULT_HEARTBEAT_MS + alle übrigen Pins in packages/core/test/publicApi.test.ts
- dom: CURSOR_MARKER_ATTRIBUTE, GeometryScheduler-Typen, createGeometryScheduler
  + alle Pins in packages/dom/test/publicApi.test.ts
- react: alle Hooks + Typen aus packages/react/test/publicApi.test.ts
Die `src/index.ts`-Re-Exports bleiben stehen (nur die Quell-Dateien dahinter ändern).

## Wave A1: react/src/hooks.ts (229 Z.) -> hooks/ Ordner (Agent 2)
- `packages/react/src/hooks/` mit je einem File pro public Hook:
  usePresenceClient.ts (inkl. clientRegistry, wrapClient, PresenceClientFactoryOptions),
  useCursorClient.ts (inkl. useLiveCursorContext, EMPTY_*-Konstanten, getServer*-Helfer),
  useRemoteCursors.ts (useRemoteCursors + useRemoteCursorsSelector),
  useCursorPresence.ts, useRemoteUsers.ts (inkl. RemoteUser-Typ, projectRemoteUsers),
  useCursorStatus.ts, useCursorContext.ts.
- `hooks.ts` wird entfernt; `src/index.ts` re-exportet die public Namen aus den
  neuen Files (Import-Style des Repos beachten: relative Pfade ohne .js-Extension,
  wie im Rest des Pakets).
- REINE VERSCHIEBUNG: keine Logik-Änderung. context.ts/contextStore.ts/provider.tsx/
  cursor.tsx bleiben unangetastet.
- Tests: react-Suite (rerenderIsolation, perf, remoteUsers, SSR) ist das Netz.

## Wave A2+B1: core/src/client.ts (592 Z.) -> interne Module (Agent 1)
Vorher: createPresenceClient (Z. 212-592) ist eine ~380-Zeilen-Closure mit 6
Verantwortungen. Ziel: client.ts als dünne Facade (~200-250 Z.) mit den public
Typen + createPresenceClient, das die internen Teile komponiert:
- `internal/reconnect.ts`: Reconnect-Backoff-Maschine + Status-Transitions
  (connect/disconnect/reconnect, Backoff 50ms->2s, Status subscribe)
- `internal/publishLoop.ts`: adaptives Publish-Scheduling + Publish-Retry
  (DEFAULT_PUBLISH_INTERVAL_MS, MIN_TIMER_INTERVAL_MS, PUBLISH_RETRY_*)
- `internal/liveness.ts`: Heartbeat-Scheduling + Stale-Sweep
  (DEFAULT_HEARTBEAT_MS, MIN_STALE_TIMEOUT_MS)
- `internal/ids.ts`: defaultIdFactory, CryptoLike, DocumentLike
- `internal/devWarnings.ts`: isDevMode, jsonByteLength, Dev-Warnings
- Closure-State wird zu einem internen State/Environment-Objekt, das an die
  internen Module übergeben wird. TIMING-SEMANTIK BITTENGLEICH BEHALTEN
  (alle Zeitkonstanten, Reihenfolge der Scheduling-Aufrufe).
- SchedulerLike bleibt exportiert (Pinned); wo es hingehört entscheidet der Agent
  (client.ts oder internal/types.ts), Index-Re-Export bleibt unverändert.

## Wave B2: dom/src/scheduler.ts (421 Z.) -> interne Module (Agent 3)
Vorher: createGeometryScheduler (Z. 111-421) ~310-Zeilen-Closure. Ziel:
- `scheduler.ts` bleibt Facade: public Typen, CURSOR_MARKER_ATTRIBUTE,
  createGeometryScheduler (rAF-Loop-Kern + dirty/clean-State)
- `internal/signals.ts`: collectShadowRoots, isCursorRootMutation,
  parseCssTimeList, Observer-Wiring (Resize/Mutation/Scroll/Transition-Events)
- `internal/rectCache.ts`: K3-Rect-Cache (gemessenen Rect liefern, solange der
  Scheduler dirty ist; Invalidate-Regeln exakt beibehalten)
- Aktivierungssync (syncActivation) bleibt im Facade-File, wenn es eng mit der
  rAF-Loop verwoben ist.
- TIMING-KONSTANTEN UNANTASTET: SAFETY_TIMEOUT_CAP_MS,
  INFINITE_ANIMATION_WINDOW_MS, CANCEL_SAFETY_MARGIN_MS, TRANSITION_*-Events.

## Gemeinsame Regeln
- Kein public-API-Change (Pins grün OHNE Edit). Keine neuen Kommentare außer
  nicht-offensichtlichem Why. Keine em-dashes. Keine neuen Deps.
- Gate pro Commit im Worktree: bun run build && bun run typecheck && bun run lint
  && bun run test (406/406).
- Commits: fein, single-line imperative, kein Co-Authored-By, kein Push.
- Reports: .agent/benchmarks/file-split.md (Zeilen vor/nach, neue Files, Commits).
