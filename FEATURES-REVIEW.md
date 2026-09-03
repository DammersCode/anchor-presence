# Neue Features — Deep-Dive (Pläne 014 · 015 · 016 + API-Cleanup)

> Review-Doc, **nicht committed**. Was in dieser Runde in die Library reingekommen ist,
> wie man es nutzt, und warum die Experience (DX) damit besser wird. Code/Bezeichner
> sind English, die Erklärung Deutsch.
>
> Hinweis: Die Anchor-API wurde danach vereinfacht. `useCursorAnchor` und manuelles
> `registry.register` sind nicht mehr Teil der öffentlichen Story. `data-anchor` bzw.
> ein konfigurierbares `anchorAttribute` ist jetzt die einzige öffentliche Anchor-Definition.

Die drei Pakete: `core` (Protokoll + Client, DOM-frei), `dom` (Browser-Layer),
`react` (Adapter).

## Auf einen Blick

| Feature | Paket | Commit | Ein Satz |
|---|---|---|---|
| `createWebSocketTransport` | `dom` | `7b97707` | Fertiger WebSocket-Transport mit Auto-Reconnect. |
| `usePresenceClient` | `react` | `3cf3480` | Stabiler Client pro `key`, übersteht StrictMode & Route-Wechsel. |
| `useRemoteUsers` | `react` | `3cf3480` | „Wer ist online?" als fertige Liste. |
| `[data-anchor]` Auto-Registration | `dom` | `1d8a6e3` | Attribut wird zur Anchor, ohne Ref. |
| `createInMemoryPair` | `core` | `e39137f` | 2-Peer-Transport für Tests ohne Browser. |
| Data-Attribute-Only Anchor API | `dom` + `react` | `ab6cc09` | `data-anchor` ist die einzige öffentliche Anchor-Definition; `useCursorAnchor` ist entfernt. |
| WebSocket-Transport ohne `room` | `dom` | `ab6cc09` | `room` ist Relay-Konzept; Transport nutzt `url`/`path`. |
| Auto-Register-Mutation-Fix | `dom` | `e89ea98` | Attribut-Änderungen an vorhandenen Elementen und Duplicate-ID-Handover werden wieder zuverlässig registriert. |
| Change-only `context`/`user` | `core` | `c017f29` | Felder werden nur bei Änderung gesendet; fehlend = unverändert, `null` = cleared. |
| Reconnect-Jitter | `dom` | `c017f29` | Backoff wird gestreut, damit Reconnect-Stürme nicht synchron einschlagen. |
| Adaptive Publish-Rate | `core` + `dom` | `c017f29` | Optionaler Slow-Mode über `transport.bufferedBytes()`, ohne Heartbeat zu touchen. |
| Validate-Hot-Path | `core` | `c017f29` | Limit-Cache + JSON-Länge als untere Byte-Schranke; weniger Encoding-Arbeit pro Inbound-Message. |

---

## 1. `createWebSocketTransport` — fertiger Transport (014)

**Was:** Eine Library-Funktion in `@anchor-presence/dom`, die `LiveCursorTransport`
implementiert. Davor hatte die Demo ihren eigenen Inline-WebSocket (`WebSocketTransport`-
Klasse). Jetzt ist es ein getesteter Baustein in der Library.

**So nutzt du es:**

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";

const transport = createWebSocketTransport({ path: "/?room=main" });
transport.connect();
const client = createPresenceClient({ transport });
```

**Optionen:**

| Option | Default |
|---|---|
| `url?` | komplettes WebSocket-URL-Override |
| `host?` | `window.location.hostname` |
| `port?` | `8787` |
| `path?` | `/` |
| `reconnect?` | `true` |
| `baseBackoffMs?` | `500` |
| `maxBackoffMs?` | `8000` |
| `WebSocketCtor?` | `globalThis.WebSocket` |

**Verhalten:** Exponentieller Backoff beim Reconnect. `subscribeStatus` spielt den
aktuellen Status jedem neuen Subscriber sofort zurück. `getStatus` ist implementiert.
Beim Relay-Neustart verbindet sich der Client selbst wieder.

**Warum besser:** Du baust keinen Socket mehr von Hand. Reconnect, Backoff und Status
sind drin und getestet. Ein Relay-Absturz fällt nicht auf — der Client kommt selbst
zurück (manueller Check: Reconnect < 2 s). Demo und Library nutzen jetzt dasselbe.

---

## 2. `usePresenceClient` — Client-Lebenszyklus (015)

**Was:** Ein React-Hook, der einen `PresenceClient` pro `key` erzeugt und für die
ganze Seitenlebensdauer memoisiert (modulweites Registry). Gleiche `key` = gleicher
Client, über Render und StrictMode-Remounts hinweg.

**So nutzt du es:**

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import { CursorLayer, LiveCursorProvider, usePresenceClient } from "@anchor-presence/react";

function App() {
  const client = usePresenceClient({
    factory: () => {
      const transport = createWebSocketTransport({ path: "/?room=main" });
      transport.connect();
      return createPresenceClient({ transport });
    },
  });
  return (
    <LiveCursorProvider client={client}>
      <CursorLayer />
    </LiveCursorProvider>
  );
}
```

Zweiter Client (z. B. Admin-Overlay) mit eigener `key`:

```tsx
const admin = usePresenceClient({
  key: "admin",
  factory: () => createPresenceClient({ transport: adminTransport }),
});
```

**Wichtig:** `PresenceClient` ist eine Einweg-Latch — `dispose()` ist final. Der Hook
disposed den Client nie beim Unmount (StrictMode + Route-Wechsel müssen weiter
funktionieren). Du rufst `dispose()` selbst auf (z. B. beim Logout). Der Aufruf löst
den `key`-Eintrag; der nächste Render erzeugt über die Factory einen frischen Client.

**Warum besser:** Kein versehentliches Neu-Erzeugen/Dispose beim Remount. Stabile
Client-Identität über StrictMode-Double-Render und Routenwechsel. Vorhersagbarer
Lebenszyklus statt „wer hat den Client gerade nochmal erzeugt?".

---

## 3. `useRemoteUsers` — wer ist online (015)

**Was:** Liefert eine Liste aller Remote-Clients; pro Eintrag `{ clientId, user, session }`.
`user` ist dein `TUser` (was du an `createPresenceClient` übergibst).

**So nutzt du es:**

```tsx
import { useRemoteUsers } from "@anchor-presence/react";

type User = { name: string; color?: string };

function OnlineBar() {
  const users = useRemoteUsers<unknown, User>();
  return (
    <span>
      {users.length} online:{" "}
      {users.map((u) => u.user?.name ?? u.clientId.slice(0, 6)).join(", ")}
    </span>
  );
}
```

**Warum besser:** Eine fertige Presence-Leiste ohne händisches Store-Abo. Die
Projection ist rein und identitätsstabil (kein extra Re-Render, wenn sich nichts
ändert). Die Library leitet keine Labels/Farben aus der `clientId` ab — `user` ist
unvertrauenswürdig und vor dem Renderen zu validieren. Im Demo steckt das in der
`WhoIsOnline`-Ecke (Kopfühlleiste unten rechts).

---

## 4. Data-Attribute-Only Anchor API (016 A + Cleanup)

**Was:** Das konfigurierte Anchor-Attribut ist die einzige öffentliche Art, Anchors zu
definieren. Standard ist `data-anchor`. Das Binding beobachtet das Attribut immer.
`useCursorAnchor`, `binding.registry.register`, `createAnchorRegistry` und andere
Lower-Level-Anchor-Plumbing-Exports sind nicht mehr Teil der öffentlichen API.

**So nutzt du es (Vanilla):**

```ts
import { createPresenceClient } from "@anchor-presence/core";
import { createDomBinding, createWebSocketTransport } from "@anchor-presence/dom";

const transport = createWebSocketTransport({ path: "/?room=main" });
transport.connect();
const client = createPresenceClient({ transport });
const binding = createDomBinding(client);

// <div data-anchor="nav.dashboard"> ist jetzt eine live Anchor.
// binding.subscribe(() => { for (const c of binding.getSnapshot()) render(c); });
```

**So nutzt du es (React):** `LiveCursorProvider` beobachtet automatisch das Attribut:

```tsx
<LiveCursorProvider client={client}>
  <div data-anchor="nav.dashboard">…</div>
  <CursorLayer />
</LiveCursorProvider>
```

**Optionen:**

| Option | Default |
|---|---|
| `anchorAttribute?` | `"data-anchor"` |
| `maxAnchors?` | `4` (geclampt auf `1`..`8`) |

`anchorAttribute` darf jedes gültige DOM-Attribut sein, z. B. `data-presence` oder `id`.
Wenn `id` konfiguriert ist, werden alle Elemente mit nicht leerem `id` zu Anchors.

**Regeln:**

- Der Attribut-Wert ist die Anchor-ID.
- Leere oder Whitespace-only-Werte werden ignoriert und im Development einmal gewarnt.
- Live-Watch per `MutationObserver`: Hinzufügen, Entfernen oder Ändern des Attributs wird erkannt.
- Kollision (zwei Elemente, gleicher Wert): neueste Registrierung gewinnt; Development-Warnung einmal pro ID.
- `binding.dispose()` räumt Auto-Anchors auf und trennt Observer.
- Der Watch läuft best-effort über Shadow-Trees (bekannte Grenze).

**Warum besser:** Ein Attribut ist ein Anchor. Es gibt keine zweite mentale Modell-Ebene
mehr mit Refs und manueller Registry. Die API bleibt lean, weil alte manuelle Pfade
vor dem Public-State entfernt werden statt deprecated zu bleiben.

---

## 5. `createInMemoryPair` — Tests ohne Browser (016 B)

**Was:** Ein drahtverbundenes 2-Peer-Transport-Paar in `@anchor-presence/core`.
`send` auf A liefert nur an B, und umgekehrt. Der Client macht Encode/Decode und
Validierung — das Paar ist nur ein dünner Schlauch.

**So nutzt du es (Unit-Test, node):**

```ts
import { createInMemoryPair, createPresenceClient } from "@anchor-presence/core";

it("liefert A's Cursor an B", () => {
  const { a, b } = createInMemoryPair();
  const clientA = createPresenceClient({ transport: a, clientId: "A" });
  const clientB = createPresenceClient({ transport: b, clientId: "B" });
  void a.connect?.();
  void b.connect?.();

  clientA.updateLocalCursor({ anchors: [{ id: "x", u: 0.5, v: 0.5 }] });
  vi.advanceTimersByTime(50);

  const fromA = clientB.getRemoteSnapshot().find((p) => p.clientId === "A");
  expect(fromA?.cursor?.anchors[0]?.id).toBe("x");
});
```

**Option:** `async?: boolean` — routet die Delivery über einen Microtask
(`queueMicrotask`), damit man zwischen `send` und Receive einschieben kann.
`dispose()` stoppt die Delivery; spätere `send` wird still verworfen (lossy by design).

**Warum besser:** „Feed A, read B" in einer Zeile, ohne Browser und ohne Relay.
`core` ist DOM-frei — das Paar läuft in der node-Testumgebung. Ideal für
Consumer-Unit-Tests, da die Library Bring-Your-Own-Transport fördert. Es ist bewusst
ein 2-Peer-Mesh; ein Many-Node-Bus wäre ein eigener Folge-Plan.

---

## Alles zusammen (vollständige Verdrahtung)

```tsx
import { createPresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "@anchor-presence/dom";
import {
  CursorLayer,
  LiveCursorProvider,
  usePresenceClient,
  useRemoteUsers,
} from "@anchor-presence/react";

type User = { name: string };

function App() {
  const client = usePresenceClient({
    factory: () => {
      const transport = createWebSocketTransport({ path: "/?room=main" });
      transport.connect();
      return createPresenceClient({ transport });
    },
  });

  return (
    <LiveCursorProvider client={client}>
      <div data-anchor="nav.dashboard">Dashboard</div>
      <CursorLayer />
      <OnlineCount />
    </LiveCursorProvider>
  );
}

function OnlineCount() {
  const users = useRemoteUsers<unknown, User>();
  return <span>{users.length} online</span>;
}
```

Damit: WS-Transport mit Reconnect · stabiler Client-Hook · Attribut-Anchors ohne Ref
· Presence-Leiste. Vier Features, die sich ergänzen.

---

## Performance-Review (2026-09-02)

- Core inbound path: vor/nach der API-Cleanup ≈380–390k msg/s — keine messbare Änderung.
- Browser-Bench (100 anchors × 50 cursors, Chromium, 240-Sample-Fenster):
  - nach dem Review-Fix ≈1.0–1.3 ms mean / ≈1.9–2.3 ms p95.
  - Referenzwert in Docs/Site: ≈1.1 ms mean / ≈2.0 ms p95.
  - Der frühere Website-Wert `1.3 ms` war deshalb zu niedrig, weil die alte Bench
    nicht wie die aktuelle Auto-Registration gemessen hatte; die neuen Werte sind
    die ersten wie-für-einander verglichenen Werte.
- Multi-Agent-Review (Pacer-Recherche + Core/DOM/Transport-Bottleneck-Audits):
  - TanStack Pacer wird **nicht jetzt** integriert. Der bestehende Client-Publisher ist bereits
    ein trailing/latest-only Throttle (50 ms, drop-latest). Pacer ist beta und würde einen
    Hot-Path mit reaktiven Store-Write ohne funktionalem Vorteil belegen. Spätestens bei
    adaptivem Hz oder observable pacing state wäre `@tanstack/pacer-lite` der richtige Kandidat.
  - Größte Over-the-Wire-Risiken: O(senders × receivers) Traffic bei fester 20-Hz-Rate,
    `context`/`user` in jeder Nachricht, validierungsseitige Doppel-Serialisierung,
    Relay-Fan-out ohne Rate-Caps, und Reconnect-Stürme ohne Jitter.
  - Priorisierte Folgeoptimierungen:
    1. `validate.ts` `byteLengthOf` ohne zweite `JSON.stringify`/`TextEncoder`-Runde
    2. Reconnect-Backoff mit Jitter
    3. Relay-Härtung: Message-Size-Cap, Rate-Limit, Ping, weniger Logging
    4. Change-only `context`/`user` + Store-Merge
    5. `bufferedAmount`/adaptive publish rate
    6. Compact binary codec v2
- Auto-Register-Korrektur nach dem Review:
  - `startAutoRegister` verwendet wieder einen einzelnen Root-Observer mit
    `childList`, `subtree`, `attributes`, und `attributeFilter: [attribute]`.
  - Das behebt den Fund, dass ein neu hinzugefügtes Anchor-Attribut auf einem
    vorhandenen Element ohne aktiven Scheduler nicht registriert wurde.
  - Bei inkrementellem Remove wird die betroffene Anchor-ID erneut gesynct,
    damit Duplicate-ID-Handover über Mutation-Records funktioniert.
  - Der Scheduler leitet Mutation-Records nur noch an `onMutationRecords` weiter,
    wenn mindestens ein Record nicht aus einer Cursor-Root stammt.
- `site/index.html`, `docs/performance.md` und `e2e/perf.spec.ts` tragen die neuen Referenzwerte.

## Over-the-Wire-Folgeoptimierungen (2026-09-02)

Umgesetzt:

- `validate.ts`: `resolveLimits` cached, `jsonFieldFits` nutzt die JSON-String-Länge als
  untere Schranke und ruft `TextEncoder` nur nahe der Byte-Grenze auf. Das spart die
  frühere Doppel-Serialisierung im Inbound-Hot-Path.
- WebSocket-Reconnect: full-jitter-Faktor `[0.5, 1.0]` auf dem geclampten Backoff,
  injizierbar über `random` für Tests.
- Change-only `context`/`user`:
  - Protokoll: fehlendes Feld = unverändert innerhalb derselben Session, explizites
    `null` = löschen.
  - Store: merge bei gleicher Session, Normalisierung von `null` auf `undefined` im
    Receiver-Snapshot, Session-Wechsel erbt keine Felder.
  - Client: Dirty-Flags, Delta-Publishes lassen unveränderte Felder weg, Heartbeat und
    Reconnect senden die aktuellen Werte als Full-Publish (leere Felder explizit als
    `null`, damit ein verpasstes Clear wieder aufgeholt wird).
- Adaptive Publish-Rate: optionale `adaptivePublish`-Option im Client, `bufferedBytes?()`
  im Transport-Interface, `WebSocket.bufferedAmount` im nativen Transport. High-/Low-Wasserlinie
  mit Hysterese; Slow-Mode ist opt-in und toucht nicht den Heartbeat.
- Doku: Relay-Härtung ist explizit Server-Aufgabe, Scaling-Grenzen in `docs/performance.md`,
  adaptive Rate + `bufferedBytes` in `docs/transports.md`, Wire-Encoding in
  `docs/security.md`/`docs/ui-context.md`.

## Binary Codec + `maxRemoteClients`-Warnung (2026-09-02)

Umgesetzt:

- `binaryCodec` in `@anchor-presence/core`:
  - Kompaktes binäres Format (Format v2, Protokoll-Version bleibt `1`).
  - `f32` für Anchor- und Viewport-Koordinaten, feste Tags für Cursor, Viewport, Pointer,
    `context`, und `user`.
  - Opake `context`/`user`-Werte bleiben als length-prefixed JSON-Payload im binären Frame.
  - `decode` ist total-safe: leerer, abgeschnittener, oder fremder Input liefert `null`.
  - `jsonCodec` bleibt Default; `binaryCodec` ist opt-in.
- Demo verwendet `binaryCodec` über den WebSocket-Relay.
- `maxRemoteClients`-Warnung:
  - Store-Option `onDropNewClient` wird nur bei neuen Client-IDs am Cap aufgerufen.
  - Client warnt in Dev-Mode einmal pro Client-Instanz, wenn das Cap neue Remote-Clients
    abwirft.
- Bench: `binaryCodec.decode + validatePresence` ≈780k hz, binärer Full-Inbound-Path
  ≈650k hz, JSON Full-Inbound-Path ≈460k hz.
- Doku: `docs/codecs.md`, `SPECIFICATION.md`, Package-READMEs, Performance-Referenz.

## Relay-Härtung (2026-09-02) — veraltet (Defaults und Close-Codes durch Runde 2 am 2026-09-03 ersetzt)

Umgesetzt:

- `apps/server/index.ts`:
  - Per-Room-Socket-Cap (Default 1000); neue Verbindungen werden mit `1013` geschlossen.
  - Per-Message-Byte-Cap (Default 32 KiB); String-Größencheck nutzt eine UTF-8-Obergrenze
    und kodiert nur ambiguous Fälle exakt.
  - Per-Socket-Token-Bucket-Rate-Limit (Default Burst 40, Refill 20/s).
  - Room-Namen werden auf 256 Zeichen begrenzt; Broadcast nur an offene Peers im selben
    Room; keine per-Verbindungs-Logs mehr.
  - Limits sind über `MAX_ROOM_SOCKETS`, `MAX_MESSAGE_BYTES`, `RATE_CAPACITY`, und
    `RATE_REFILL_PER_SECOND` konfigurierbar.
- Doku: Relay-Grenzen in `docs/transports.md`, `docs/performance.md`, und `SPECIFICATION.md`.

## QA + Regression-Fix (2026-09-02)

- Agent-Browser-Check mit zwei Demo-Client-Instanzen:
  - bidirektionale Cursor-Synchronisation über `binaryCodec`
  - Page-Context-Mismatch: Cursor wird beim Empfänger versteckt und nach Navigation
    wieder sichtbar
  - keine Console-Errors in Sender/Receiver
- Relay-Härtungs-Integrationstests: Broadcast, Oversized-Drop, Room-Isolation, Room-Cap
  (`1013`), Token-Bucket mit Burst und Refill.
- Bug-Fix: `RemotePresenceStore` materialisierte nach einem Delta-Merge abwesende
  `context`/`user`-Felder als eigene `undefined`-Properties. Öffentliche Presences lassen
  leere Felder jetzt tatsächlich weg.
- Regressionstests: Store-Feld-Omission, `binaryCodec`-End-to-End über
  `createInMemoryPair`, Relay-Integration.

Bewusst nicht umgesetzt / bekannte Beobachtung:

- Nach einem Sender-Reload bleibt die alte Client-Instanz bis zum `staleTimeoutMs`
  (Default 70 s) sichtbar; das Reference-Demo sendet bewusst kein best-effort `pagehide`-Leave.
- Store-Notification-Batching (aktuell nur ein Snapshot pro Inbound-Nachricht; kein
  messbarer Engpass).
- Slot-basiertes Snapshot-Update für N=1000 (aktuell 64-Cap, O(n) Copy ist ok).
- SignalR Binary-Beispiel (bleibt Sketch).

Neue Messwerte nach der Runde:

- Core inbound path: ≈650k hz mit `binaryCodec`, ≈460k hz mit `jsonCodec`
  (früher ≈396k hz JSON).
- Browser 100×50: `e2e/perf.spec.ts` Budget grün (Referenz 1.1/2.0 ms).
- 342 Unit/Integration-Tests grün.

## Verifikation (alle grün)

- `bunx vitest run` — 342 Tests
- `bunx tsc --build packages/core packages/dom packages/react` — exit 0
- `cd apps/demo && bunx vite build` — OK
- `bunx oxlint --type-aware` — 0 Fehler
- `bunx vitest bench --project core --run` — binary full inbound path ≈650k hz
- `bunx playwright test --project=chromium` — 13 E2E-Tests grün
- Agent-Browser-2-Client-Check: bidirektionale Cursor-Sync, Page-Context-Mismatch,
  Console clean

## Commits (Branch `dev`, nicht gepusht)

- `7b97707` add createWebSocketTransport to @anchor-presence/dom
- `3cf3480` add usePresenceClient and useRemoteUsers react hooks
- `1d8a6e3` add [data-anchor] auto-registration to dom binding
- `e39137f` add createInMemoryPair test transport to core
- `de490cd` update plans status
- `b602515` document data-attribute-only anchor api design
- `ab6cc09` clean pre-public anchor and websocket transport api
- `e89ea98` fix auto-registration mutation handling and update perf reference
- `c017f29` add over-the-wire presence optimizations
- `e2195c9` document over-the-wire protocol and adaptive publish options
- `0759ee9` add maxRemoteClients dev warning
- `b3ec316` add binaryCodec compact wire codec
- `6ab1096` harden reference relay with size rate and room limits
- `64877ad` add relay hardening integration tests
- `47ca6b3` fix store field omission after delta merge

## Audit-Fleet-Runde (2026-09-03)

Multi-Agent-Audit (Architektur, Bugs, Performance, Security/Tests/Dependencies,
Realtime, Feature-Gaps) mit unabhängiger Verifikation und Advisor/Challenger-Runden.
Details: `.agent/` (reports, research, benchmarks, insight-memory). Alles gemerged
in `dev`, nicht gepusht.

### Fixes (jeder mit Regressionstests)

- **Security:** `sequence` begrenzt auf `2^31-1` (`DEFAULT_MAX_SEQUENCE`, JSON- und
  Binary-Pfad). Ohne Limit: böswilliger Peer spoofert fremdes `(clientId, session)`
  mit `seq ~1e21` -> Cursor des Opfers dauerhaft eingefroren.
- **Security:** Nesting-Tiefe für `context`/`user` begrenzt (`DEFAULT_MAX_FIELD_DEPTH` = 8).
- **Security:** Relay — globales Total-Socket-Cap `RELAY_MAX_TOTAL_SOCKETS` (10000);
  Room-Cap `RELAY_MAX_ROOM_SOCKETS` von 1000 auf 128 (2x Client-Cap 64); Abweisung
  mit 4001/4002 (statt reserviertem 1013).
- **Security:** Relay — Origin-Allowlist `RELAY_ALLOWED_ORIGINS` (leer = alle;
  gesetzte Allowlist + fehlende Origin = 4004).
- **Resilienz:** Relay — Liveness: Ping 30 s, stumme Peers nach 60 s mit 4005.
- **Resilienz:** Relay — Slow-Peer-Schutz: Skip des Broadcasts ab `bufferedAmount`
  > 1 MiB (lossy ok: latest-state-wins + 10 s-Heartbeat), Resume < 512 KiB
  (Hysteresis), Close 4003 > 8 MiB.
- **Perf (gemessen):** `CursorLayer` rendert nur den bewegten Cursor (per-Cursor
  `React.memo`; Resolver-Identity-Reuse).
- **Bug:** Reconnect übersteht `new WebSocket()`-Fehler (vorher: uncaught exception,
  Status stuck auf "reconnecting").
- **Bug:** Cursor-Neuerscheinung nach `cursor:null`-Phase snappt statt von (0,0) zu
  easen (additives `Interpolator.reset?`).
- **Bug:** `useCursorContext` reagiert auf direkte `client.setContext()` (neues
  `client.subscribeContext()`).
- **Perf:** Publish-Retry-Backoff (50 ms -> 2 s) für dauerhaft fehlschlagende Transports.
- **Feature:** Publish-Flush bei `visibilitychange` (Tab sichtbar -> Pending-Publish sofort).
- **API:** `onRemoteClientDrop` ist öffentliche Client-Option (vorher nur Dev-Warning).
- **Architektur:** gemeinsame `CURSOR_MARKER_ATTRIBUTE` über dom/react; Scheduler-
  Safety-Timer über injizierbare Timer-Seam; core publicApi-Pin-Test.

### Entscheidungen (Advisor + Challenger)

- **Codec:** `jsonCodec` bleibt Default — Relay relayt rohe Bytes, json und binary
  sind wire-inkompatibel, Mixed-Version-Rooms würden still brechen. `binaryCodec`
  ist die empfohlene Production-Wahl (halbes Wire-Volume, ~37 % weniger Inbound-CPU),
  jetzt in `docs/codecs.md` dokumentiert. Revisit: Codec-Negotiation in Protokoll v2.
- **Realtime:** EVOLVE CURRENT — plain WebSocket bleibt, keine Migration.
  Reihenfolge: Liveness + Slow-Peer (done) -> Auth-Hook -> Broker-Gateway (Redis
  Pub/Sub) nur bei >1 Node. WebTransport-Datagrams als Watch-Item (84,48 % Support).

### Messwerte (vor / nach, dev)

| Metrik | Vor (47ca6b3) | Nach |
|---|---|---|
| build | 2,0 s | 3,0 s |
| typecheck | 0,4 s | 0,2 s |
| lint | 161 W / 0 E | 167 W / 0 E (neu: nur Test-Dateien, gleiche Klassen) |
| tests | 26,9 s, 342 | ~16–23 s, 381+ (alle grün) |
| dist (core+dom+react) | 241,8 KB | 253,5 KB |

### Offen (Roadmap: `.agent/reports/roadmap.md`)

- K2 (P1, gemessen): `useCursorPresence` rendert pro Inbound-Message — Selector-Nutzung/Design.
- K3 (P1, inferiert): Sender-Reflows bei pointermove (gBCR-Fallback) — erst messen.
- Lint-Batch (167 Warnings, P3), Test-Gaps (adversariales E2E, stale-sweep E2E,
  binaryCodec Encode-Throw-Pfade), Relay-Auth-Hook.
- Open-Source-Vergleich (IP blockiert, wurde zuletzt angehängt).

### Incident-Hinweis

`FEATURES-REVIEW.md` (untracked) wurde während der Runde durch eine Agent-Aktion
gelöscht und aus dem Papierkorb wiederhergestellt; ebenso `plans/doc-cleanup.prompt.md`.
Ursache nicht identifiziert — Folge: keine Agent-Aktion ohne expliziten Datei-Scope
und Read-only-Vorgaben mehr (war ab Runde 2 so), Vorhandensein ungetrackter Dateien
vor/nach Agent-Läufen prüfen.
