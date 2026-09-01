# Library Review — Core / DOM / React

**Status: RESEARCH ONLY — nichts davon ist gefixt.** Keine Commits, kein Push.
Diese Datei dokumentiert die Befunde aus dem Code-Review der drei Library Packages
(`@anchor-presence/core`, `@anchor-presence/dom`, `@anchor-presence/react`),
um sie später nacheinander zu prüfen und zu fixen.

- **Geprüft:** 31.08.–01.09.2026, Quellstand `dev` ab Commit `c5f5528`
- **Methode:** Quellcode vollständig gelesen, gegen `SPECIFICATION.md` (§4–§13) und
  bestehende Tests abgeglichen; Subagent-Reviews für core und react manuell auf
  Korrektheit gegen den tatsächlichen Code verifiziert, dom manuell gelesen
- **Bezug:** `apps/demo` und die Beispiele (`examples/*`) sind NICHT Teil dieses Reviews

Legende:

- **Schweregrad:** 🔴 high (falsches Verhalten in Produktion) · 🟡 medium (Resource-Leak /
  unzuverlässiges Verhalten unter bestimmten Bedingungen) · 🟢 low (Edge Case / API-Ärger)
- **Betroffen:** alle Orte, die vom Befund berührt sind (Datei + Stelle)

---

## 1. Bugs (reihenfolge nach Schweregrad)

### B1 · 🔴 Cursor friert nach `reconnecting` ein — kein Resync

| Feld | Wert |
|---|---|
| **Wortlaut** | Eine Sendung im Status `reconnecting` wird als "verschickt" gewertet, aber beim Übergang `reconnecting → connected` wird der neuste State **nicht** neu veröffentlicht — der Remote-Cursor steht bis zum nächsten lokalen Move oder dem nächsten Heartbeat (~10 s). |
| **Warum / weshalb** | `send()` akzeptiert die Bytes, solange der Status weder `disconnected` noch `connecting` ist — `reconnecting` ist also sendbar. Danach wird `lastSentCursor` auf den neusten Stand gesetzt, obwohl der Transport die Daten evtl. verworfen hat (Socket.IO verliert Emits während des Ausfalls, die Verbindung ist kurz davor neu aufgebaut). Der Resync-Code in `setStatus()` prüft `!wasSendable` — `wasSendable` ist für `reconnecting` aber `true`, daher wird bei `reconnecting → connected` **kein** Republish eingeplant. Der vorhandene Test "F4" deckt nur `disconnected → connected` ab. |
| **Genauer Ort** | `packages/core/src/client.ts` — `send()` (Kredit von `lastSentCursor`), `schedulePublish()`-Timer-Callback, `setStatus()` (der `wasSendable`-Guard) |
| **Betroffene Parts** | `packages/core/src/client.ts`; nachgelagert: `packages/react` (jedes UI, das `useRemoteCursors*` liest) und `packages/dom` (Resolver interpoliert weiter gegen den eingefrorenen Zielwert) |
| **Auslöser** | Netzwerk-Flap: Socket.IO schickt `reconnect_attempt` (→ Status `reconnecting`); SignalR mappt Hub-Disconnect auf `reconnecting`. Lokale Maus-Bewegung während der Ausfallzeit, danach Reconnect ohne weitere Bewegung. |
| **Suggested fix** | Im Timer-Callback die Sendung erst nach Erfolg im Status `connected` kredenzieren oder `lastSentCursor` nur bei `connected` setzen; zusätzlich den Resync-Trigger auf *jeden* Übergang *in* `connected` ausweiten (nicht nur von `disconnected`). |
| **Status** | ⬜ offen |

### B2 · 🟡 `transport.connect()` nie aufgerufen, `transport.disconnect()` nie bei `dispose`

| Feld | Wert |
|---|---|
| **Wortlaut** | Der Client ruft `connect()` und `disconnect()` des Transports nie auf. Der Transport muss vom Integrator extern verbunden (und getrennt) werden. |
| **Warum / weshalb** | `createPresenceClient` wickelt Timer, Teardowns und Transport-Subscriptions ein, berührt aber nie `transport.connect?()` / `transport.disconnect?()`. Ein Transport, der erst per `connect()` die Verbindung öffnet (z. B. der Demo-`WebSocketTransport`), hängt unbenutzt, wenn der Integrator den Aufruf vergisst — das passiert real: `apps/demo` und beide Beispiele müssen `transport.connect?.()` manuell in `setup.ts` aufrufen. Entsprechend schließt `client.dispose()` den Socket nicht: Socket-, Listener- und Relay-Slots bleiben bis zum Page-Unload. |
| **Genauer Ort** | `packages/core/src/client.ts` — `createPresenceClient()` (kein `connect` am Ende), `dispose()` (kein `disconnect`) |
| **Betroffene Parts** | `packages/core/src/client.ts`, `packages/core/src/transport.ts` (Interface), `apps/demo/src/cursors/{setup.ts,transport.ts}`, `examples/socketio/{transport.ts,client/src/cursors/setup.ts}`, `examples/signalr/client/src/cursors/setup.ts`, `docs/transports.md` (zeigt `transport.connect()` explizit als Integrator-Step) |
| **Auslöser** | (a) Transport wird nie geöffnet → kein Datenfluss, Status bleibt `connecting` für immer. (b) `dispose()` in einem SPA-Wechsel → offene Sockets/Relay-Slots. |
| **Suggested fix** | Kernentscheidung: Entweder der Client besitzt den Lifecycle (`transport.connect?.()` bei Creation, `transport.disconnect?.()` in `dispose()`) und alle Integratoren + Docs rücken nach — oder `connect?`/`disconnect?` aus dem Interface streichen und der Integrator bleibt Besitzer. Beide Optionen sind konsistent; heute ist es eine dritte, implizite Option. |
| **Status** | ⬜ offen (Designentscheidung nötig) |

### B3 · 🟡 React: `useRemoteCursorsSelector` mit inline `select` → Re-Subscribe + Referenz-Switch pro Notification (Render-Loop-Risiko)

| Feld | Wert |
|---|---|
| **Wortlaut** | Wird `select` als inline Arrow übergeben (der Doku-Laut Häufigste Fall), bekommt `getSnapshot` pro Render eine neue Identität. `useSyncExternalStore` re-subscribt dadurch bei jedem Commit, und der in-render Snapshot-Vergleich sieht bei jeder Notification ein frisches `select`-Ergebnis — mit einer instabilen `isEqual` (z. B. Array über `.map`) re-rendert die Komponente pro Frame. |
| **Warum / weshalb** | `useCallback(..., [binding, select, isEqual])`: `select` ist inline → neue Referenz pro Render → neue `getSnapshot` → React wertet bei jeder Store-Notification den Snapshot neu aus; die Memoisierung in `selectedRef` funktioniert nur, wenn dieselbe `getSnapshot` erneut aufgerufen wird. Zusätzlich: die `isEqual`-Cache-Sperre vergleicht nur `selectedRef` gegen das neue Ergebnis — bei geänderter `select`-Identität ist das vorherige Ergebnis ein Objekt aus einem anderen Render-Zyklus. |
| **Genauer Ort** | `packages/react/src/hooks.ts` — `useRemoteCursorsSelector` (`getSnapshot`-`useCallback` + `selectedRef`) |
| **Betroffene Parts** | `packages/react/src/hooks.ts`, `packages/react/src/index.ts` (Export), `packages/react/README.md` + `docs/react.md` (Doku sagt nur "keep stable" ohne Erzwingung). Konsumenten: `packages/react/src/cursor.tsx` (`CursorLayer`), alle Beispiele (`PresencePill.tsx`). |
| **Auslöser** | `const ids = useRemoteCursorsSelector((c) => c.map(x => x.clientId))` ohne `useCallback`. Im Demo selbst ist es `useCallback`-gedeckt, deshalb nie aufgetreten. |
| **Suggested fix** | Den neusten `select` in einem Ref spiegeln und `getSnapshot` pro `binding` stabilisieren (keine Re-Subscribe); dev-warning bei instabiler `select`-Identität. |
| **Status** | ⬜ offen |

### B4 · 🟡 React: `client → null` lässt selbst erstelltes `DomBinding` stehen (Leak + staler Binding)

| Feld | Wert |
|---|---|
| **Wortlaut** | Schaltet der Provider von einem echten `client` auf `client={null}`, wird das von ihm geschaffene `DomBinding` **nicht** gecleart: Der Early-Return `if (client === null) return;` hat keine Cleanup-Funktion, daher läuft der Effect-Cleanup nicht und `ownBinding` bleibt gesetzt — das Binding lebt mit seinem Client weiter (Listener/Registry nicht geleert), und die Hooks lesen gegen einen toten Binding. |
| **Warum / weshalb** | In React werden Effect-Cleanups nur aufgerufen, wenn der vorherige Effect-Runde einen Cleanup-Return geliefert hat. Der Early-Return liefert kein Cleanup → der Vorlauf-Cleanup (aus der Runde mit `client !== null`) wurde bereits beim ersten Client-Wechsel oder gar beim `client→null`-Wechsel nicht erneut ausgelöst, weil die Dependency-Liste `[client, providedBinding]` zwar einen neuen Lauf triggert, aber dieses Mal keinen Cleanup-Return liefert. `setOwnBinding(null)` fehlt im `client === null`-Pfad. |
| **Genauer Ort** | `packages/react/src/provider.tsx` — der `useEffect` (Early-Return + fehlende `setOwnBinding(null)` im null-Pfad) |
| **Betroffene Parts** | `packages/react/src/provider.tsx`, nachgelagert `packages/react/src/hooks.ts` (alle Hooks lesen `binding` aus dem Context), `packages/dom/src/binding.ts` (das geleakte Binding) |
| **Auslöser** | `<LiveCursorProvider client={client} …>` mit `client = null` (z. B. während SSR→Client-Übergang oder eines `?name=`-Reloads), oder ein Conditional-Render des Providers. |
| **Suggested fix** | `setOwnBinding(null)` in den `client === null`-Pfad, und den Binding-Dispose sicherstellen, dass er genau einmal pro selbst erstelltem Binding läuft. Alternativ: Binding-Dispose ausschließlich über `client.registerTeardown` verwalten. |
| **Status** | ⬜ offen |

### B5 · 🟢 Core: `staleTimeoutMs` ≤ 1 erzeugt einen 0-ms-Sweep-Timer (permanentes Rescheduling)

| Feld | Wert |
|---|---|
| **Wortlaut** | `staleTimeoutMs: 1` → `sweepIntervalMs = 0` → `setTimeout(fn, 0)` rescheduled sich selbst in jedem Macrotask, auch ohne Peers. |
| **Warum / weshalb** | Die Optionen werden ohne Clamp akzeptiert (`Math.max`-Guard fehlt), der Sweep-Intervall ist reiner Teil `staleTimeoutMs / 2`. |
| **Genauer Ort** | `packages/core/src/client.ts` — `sweepIntervalMs`-Berechnung, `scheduleSweep()` |
| **Betroffene Parts** | nur `packages/core/src/client.ts`; Beispiele nutzen `?stale-ms=`-Param, dort ist das Value aber `Number(...)` ohne Guard |
| **Auslöser** | `?stale-ms=1` im Beispiel-URL oder ein Programm-Creation mit `staleTimeoutMs: 0/1`. |
| **Suggested fix** | Constructor-Clamp `staleTimeoutMs = Math.max(1, staleTimeoutMs ?? default)`; analog für `publishIntervalMs` (0 → jeder `updateLocalCursor` published sofort) und `maxRemoteClients` (0 → alle Remotes abgelehnt, ununterscheidbar von "keine Peers"). |
| **Status** | ⬜ offen |

### B6 · 🟢 Core: oversized `context`/`user` geht raus, wird aber bei allen Peers still entfernt — asymmetrischer State, ohne Warning

| Feld | Wert |
|---|---|
| **Wortlaut** | Der lokale Client sendet `context`/`user` jeder Größe; jeder Peerd strippt das Feld, wenn es über `maxFieldBytes` (Default 8 KiB) liegt. Der eigene UI zeigt den Context, jeder Remote-UI zeigt nichts. |
| **Warum / weshalb** | `validatePresence` erzwingt die Begrenzung nur auf dem Incoming-Pfad; der Outgoing-Pfad (`buildMessage` → `codec.encode`) validiert nicht. |
| **Genauer Ort** | `packages/core/src/client.ts` — `buildMessage()`, `setContext`, `setUser`; Vergleich: `packages/core/src/validate.ts` (`byteLengthOf` only im Inbound) |
| **Betroffene Parts** | `packages/core/src/client.ts`; Konsumenten: alle Apps, die große Context-Objects setzen |
| **Auslöser** | `client.setContext({ blob: 20_000 Zähler })` — z. B. ein Debug-Payload; die Peers sehen den Context nicht. |
| **Suggested fix** | Einmaliges `console.info`/`warn` bei `setContext`/`setUser`, wenn die Serialisiert-Größe die Limit übertrifft (die Peerd wird es entfernen). |
| **Status** | ⬜ offen |

---

## 2. API-Verbesserungen

### A1 · Core: `connect?`/`disconnect?` sind "vestigial Surface" (siehe B2)

Die Frage ist Konsistenz: **Entweder** der Client besitzt den Lifecycle (dann B2 fixen
und das Interface als Vertrag halten), **oder** die Methode aus dem Interface
streichen, damit der Vertrag dem Verhalten entspricht. Heutige Option (Implizite
Integrator-Eigenschaft) ist die gefährlichste, weil sie beides suggeriert.

**Status:** ⬜ offen (mit B2 entscheiden)

### A2 · Core: `updateLocalCursor`-Kontrakt ist nicht dokumentiert (Referenz-Identität)

Der Publisher deduziert per `latestCursor !== lastSentCursor` auf Objekt-Identität.
Implizite Folgerungen für den Call-Party:

- Ein frisches Objekt pro Position erwarten (im Pointer-Pfad macht das die DOM-
  Schicht automatisch).
- Einmal das **selbe** Objekt mehrfach übergeben → wird nur ein Mal gesendet
  (auch wenn das Objekt zwischenzeitlich mutiert ist).
- `null` übergeben, um "Cursor weg" zu publizieren.

**Ort:** `packages/core/src/client.ts` (JSDoc an `updateLocalCursor`)
**Betroffen:** alle Callers die manuell (ohne DOM-Schicht) Position senden.
**Suggested:** Einzeiliger JSDoc: "Pass a fresh object per position; `null` to leave."

**Status:** ⬜ offen

### A3 · Core: `registerTeardown`-Name klingt nach interner API

Ein "register teardown" in der public API ohne zeitliche Semantik. Umbenanmen auf
`registerCleanup` oder eine JSDoc-Linie, dass der Callback bei `dispose()` genau
einmal feuert und die Reihenfolge unbestimmt ist.

**Ort:** `packages/core/src/client.ts` (public `PresenceClient` Interface)
**Betroffen:** `packages/dom/src/binding.ts`, `packages/dom/src/pointer.ts` (jeweils
`client.registerTeardown(...)`), `packages/react` (indirekt).
**Status:** ⬜ offen

### A4 · Core: `CursorCodec` verliert Generics von `CursorPresence<TContext, TUser>`

Ein typisierter Custom-Codec (z. B. binär) kann `TContext` nicht ausdrücken —
`encode(message: CursorPresence)` nimmt die Non-Generics-Variante an, der Call-Party
muss `as`-Casts auf beiden Seiten machen, wenn er typisierte Felder serialisieren will.

**Ort:** `packages/core/src/codec.ts`, `packages/core/src/index.ts`
**Betroffen:** alle Custom-Codec-Integratoren (heute nur `jsonCodec`, aber der
Pfad ist offen).
**Suggested:** Codec generisch machen (`CursorCodec<TContext = unknown, TUser = unknown>`)
oder explizit in Doku schreiben, dass Codec auf untypisierten Payloads arbeitet.
**Status:** ⬜ offen

### A5 · React: kein Hook für eigene ClientId

`client.clientId` existiert auf dem Typ, aber nur `useCursorClient()` ist exportiert.
Jeder "mich hervorheben / self ausschließen"-Consumer muss `useCursorClient()?.clientId`
selbst schreiben.

**Ort:** `packages/react/src/hooks.ts`, `packages/react/src/index.ts`
**Betroffen:** jedes UI, das "du bist du"-Logik baut.
**Suggested:** `useCursorClientId(): string | null` hinzufügen (Zweizeiler).
**Status:** ⬜ offen

### A6 · React: Dead Provider — disposed Client wird ohne Warnung akzeptiert

Ein `dispose()`d Client latched nie wieder (Spez-Vertrag), aber
`LiveCursorProvider` baut daraufhin fröhlich ein `DomBinding` auf: Pointer-Source
bindet an `document`, Status/Subscribes laufen, aber es kommt nie Remote-Daten —
null Cursor, kein Log.

**Ort:** `packages/react/src/provider.tsx`
**Betroffen:** jeder Provider, der nach dem Disposal noch gemountet ist
(z. B. StrictMode-Doppel-Mount, wenn der Client zu früh disponiert wurde).
**Suggested:** Der Client bekommt ein `disposed`-Flag (eigentlich schon als
interne Variable da) und der Provider warnt in dev, wenn er einen disposed Client
bekommt. Alternativ: Doku klar schreiben, dass ein disposed Client nichts rendert.
**Status:** ⬜ offen

### A7 · React: Ownership/Dispose-Semantik ist nicht dokumentiert

Der Provider owned nur das selbst geschaffene `DomBinding`; den `client` und ein
extern übergebenes `binding` owned die App. Das steht nirgends.

**Ort:** `packages/react/README.md`, `docs/react.md`
**Betroffen:** alle Provider-Nutzer.
**Suggested:** Zweizeiliger Abschnitt in der README: "Provider disposes only its
self-created binding; client and provided binding are consumer-owned; a disposed
client renders nothing."
**Status:** ⬜ offen

---

## 3. Performance

### P1 · 🔴 (Perf) React: `CursorLayer` rendert **pro Frame** die ganze Subtree

| Feld | Wert |
|---|---|
| **Wortlaut** | `CursorLayer` selektiert das gesamte gefilterte `ResolvedCursor[]`-Array; `sameCursors` vergleicht **Objektidentität**. Der Remote-Resolver erzeugt pro Frame neue `ResolvedCursor`-Instanzen (X/Y werden in der DOM-Schicht interpoliert) → selbst eine statische 2-Peer-Szene re-rendert die gesamte `CursorLayer`-Subtree (alle `<div>`s, alle `style`-Objects, alle `translate3d`-Strings) in Frame-Rate. |
| **Warum / weshalb** | Der Vertrag laut Aufgabe: "React sollte nur bei strukturellen Änderungen (Peer-Liste, Status, Page) re-rendern; pro-Frame Bewegung wird außerhalb von React angewendet." Bei `item === b[index]` auf frischen Object-Referenzen ist die Sperre wirkungslos. |
| **Genauer Ort** | `packages/react/src/cursor.tsx` — `CursorLayer` (`select` + `sameCursors`) |
| **Betroffene Parts** | `packages/react/src/cursor.tsx`, Konsumenten: `apps/demo/src/cursors/CursorLayer.tsx`, alle drei Beispiel-Clients (über `CursorLayer` bzw. eigene Render) |
| **Auslöser** | Zwei Tabs offen, einer bewegt den Mouse — der andere rendert die Cursor-Subtree pro Frame. |
| **Suggested fix** | Nur strukturelle Identität selektieren: `{ clientId, visible, anchorId, tier }` — Position wird von der DOM-Scheduler auf `style.transform` angewendet, nicht über React. Oder `isEqual` auf `clientId + anchorId`-Keypaar vergleichen. |
| **Status** | ⬜ offen |

### P2 · 🟡 (Perf) Core: `useCursorPresence` feuert auf Wire-Ebene, nicht strukturell

| Feld | Wert |
|---|---|
| **Wortlaut** | `RemotePresenceStore.getSnapshot()` ändert die Identität bei **jeder** akzeptierten `ingest` — also bei jedem Remote-Cursor-Move (~20 Hz × N Peers), obwohl sich nur `cursor: CursorPosition` ändert. Consumer von `useCursorPresence` (Presence-Pile, Avatare) re-rendern 20×/s bei inhaltlich identischem Output. |
| **Warum / weshalb** | Der Snapshot ist das rohe Presence-Object inkl. `cursor`-Feld; es gibt keine "nur strukturel" View. |
| **Genauer Ort** | `packages/core/src/store.ts` — `getSnapshot()` (bumped bei jedem `markDirty()`); nachgelagert: `packages/react/src/hooks.ts` (`useCursorPresence`) |
| **Betroffene Parts** | `packages/core/src/store.ts`, `packages/react/src/hooks.ts`, UI: `examples/*/src/cursors/PresencePill.tsx` (nutzt `useCursorPresence` + `useRemoteCursorsSelector` kombiniert) |
| **Auslöser** | Zwei Tabs offen, einer bewegt den Mouse — der PresencePile im andren rendert pro Move. |
| **Suggested fix** | Im Core: Snapshot-Identität ignorieren bei `cursor`-Feld-Change (zwei Snapshots: full + presence-only); oder ein `subscribePresence(listener)` neben `subscribe` anbieten, dass nur bei Peer-Ein-/Austritt, Session-Change oder context/user-Change feuert. |
| **Status** | ⬜ offen |

### P3 · 🟢 (Perf) Core: doppelt `JSON.stringify` im Inbound-Path auf Feld-Basis

| Feld | Wert |
|---|---|
| **Wortlaut** | `validatePresence` misst `context`/`user` per `byteLengthOf(...)` — das **stringifiziert exakt dieselben Values**, die `jsonCodec.encode` soeben schon mal stringisiert hat (bzw. die ein Peers-Encoder erzeugt hat). Bei 4 KB Context + 20 Inbound-Message/s sind das 40 redundante Serializierungen/s. |
| **Warum / weshalb** | `byteLengthOf` ist eine generische "wie groß ist das?"-Hilfe; sie weiß nicht, dass der Wire-bytes-Summe schon da ist. |
| **Genauer Ort** | `packages/core/src/validate.ts` — `byteLengthOf()` (neu `TextEncoder()` pro Feld), `resolveLimits()` (neu Object pro Message), `validatePresence` (beide mal pro Context/user) |
| **Betroffene Parts** | `packages/core/src/validate.ts`; nachgelagert: der Throughput-Budget in `packages/core/bench/hotpath.bench.ts` + `packages/core/test/allocation.test.ts` |
| **Auslöser** | Große `context`-/`user`-Felder (z. B. der Debug-Payload aus B6). |
| **Suggested fix** | (a) `TextEncoder` auf Modul-Ebene hoisten (als `codec.ts` schon tut), (b) einmal pro `validatePresence`-Call statt pro Feld die Limits auflösen, (c) auf die gesamte decodierten Message-Größe statt Feld-weise begrenzen. |
| **Status** | ⬜ offen |

### P4 · 🟢 (Perf) Core: `context`/`user` pro Frame neu stringifiziert

| Feld | Wert |
|---|---|
| **Wortlaut** | `buildMessage` ruf `codec.encode` pro 50 ms-Frame und pro Heartbeat auf — `JSON.stringify` stringifiziert dabei **alle** Felder, auch `context`/`user`, die sich nie ändern. |
| **Warum / weshalb** | Dem JSON-Codec ist das egal; er weiß nicht, welche Felder sich geändert haben. |
| **Genauer Ort** | `packages/core/src/client.ts` — `buildMessage()` + `send()` → `codec.encode()`; `jsonCodec.encode` in `packages/core/src/codec.ts` |
| **Betroffene Parts** | `packages/core/src/client.ts`, `packages/core/src/codec.ts` |
| **Auslöser** | Jede lokale Cursor-Bewegung (20 Hz) bei großen `context`/`user`. |
| **Suggested fix** | Binärer Codec (Spez alludiert den), oder explizite Doku "context sollte klein sein (≤ ein paar KB)". Kurzfristig: die Felder nicht neu stringify, wenn sich nur die Koordinaten geändert haben (schwer ohne Codec-Change). |
| **Status** | ⬜ offen (Langzeit-Item) |

---

## 4. Fehlende Regressionstests (für spätere Fixes)

| # | Test-Fall | Befestigt |
|---|---|---|
| T1 | `reconnecting → connected` ohne Zwischen-Move muss neusten State neu publizieren (Fake-Transport mit Status-Steuerung, Timer fake) | B1 |
| T2 | `setContext`/`setUser` mit stabilem Cursor: heute = nur beim Heartbeat; Fix-Verhalten = sofort. Test muss *das beabsichtigte* Verhalten pinnen, damit ein stiller Flip auffällt. | A2 / A6 |
| T3 | Transport-Lifecycle: `transport.connect` (falls gegeben) wird bei Creation aufgerufen, `transport.disconnect` (falls gegeben) wird bei `dispose` aufgerufen. | B2 |
| T4 | Oversized lokal `context`/`user` (> 8 KiB): Roundtrip durch zwei Clients; der Peerd sollte `undefined` im Feld sehen (heute = asymmetrisch, Fix nach B6 sollte das loggen). | B6 |
| T5 | Re-entrant Store-Notification: Ein `subscribeRemote`-Listener, der sich **innerhalb** seines Callbacks unsubscribed + neu subscribe, muss für diese Änderung feuern; der alte darf nicht mehr feuern. (Sicher mit `Set`-Semantik, aber ungetestet.) | (keiner der oberen — generischer Guard) |
| T6 | `staleTimeoutMs: 1` darf nicht zu einem 0-ms-Sweep führen (Fake-Time-Fenster, `sweep`-Call-Count begrenzt). | B5 |
| T7 | React StrictMode: Provider **erzeugt** eigenes Binding (heute testen alle `binding={…}` explizit) → genau ein Live-Binding/Listener nach Doppel-Mount. | P1 / B4 |
| T8 | React: Prop-Folge `client → null → client` → Binding-Listener-Count geht auf 0, Anker-registrieren neu am neuen Client. | B4 |
| T9 | React: `useRemoteCursorsSelector` mit **inline** `select` (ohne `useCallback`) → nach Fix: endliche Render-Count; ohne Fix: Regression-Pin. | B3 |
| T10 | React: `useCursorContext` Roundtrip (einer setzt, anderer liest) unter StrictMode + `client === null` Fallback-Pfad (heute nur SSR-Snapshot-Test; das verifiziert keine Reattività). | A4 |

---

## 5. Dom (kein Handlungsbedarf — nur für Vollständigkeit)

Der DOM-Code wurde komplett gelesen (`binding.ts`, `frameCache.ts`, `geometry.ts`,
`occlusion.ts`, `pointer.ts`, `registry.ts`, `resolver.ts`, `scheduler.ts`). Die
wichtigsten Mechanismen sind korrekt:

- **FrameCache:** korrekt invalidiert (Resize-Observer, MutationObserver auf
  `document.body`, `window.resize`, `document.scroll` capture, Transition/Animation
  Window, `runPass()`-Loop). Keine Leaks (Maps werden pro Frame neu erzeugt).
- **Scheduler:** korrekt `disposed` (alle Listener, Observer, `transitionEntries`,
  `caf(rafHandle)`). Keine rAF-Leaks.
- **Registry:** korrekt; `WeakMap`-Reverse-Map kann stale Einträge halten, aber
  `ancestors()` cross-checkt gegen die Forward-Map (`map.get(id) === element`).
- **Occlusion:** korrekt; `readClientRect` schützt vor falschen Rect-Werten,
  `getComputedStyle` wird nur bei Bedarf (nur auf klemmende Vorfahre).
- **Pointer:** korrektes Detach (alle 5 Listener); `composedPath[0]` für Shadow-Roots.

**Ein kosmetisches Timing-Artefakt** (kein Bug): In `runPass` wird der
`frameCache.measure()` bei `shouldRemeasure = true` mit dem alten Frame aufgerufen
(aus `frameCache.reuse()` kommt `null` wenn `frame === null`); das erste `getRect`
misst also neu, aber der Cache hat ein leeres `rects`-Map. In der Praxis unsichtbar
(weil `startFrame()` das `rects`-Map direkt füllt), aber der Code wäre klarer,
wenn `measure()` explizit `startFrame()` rufen würde, statt durch `reuse() ??`
gezwungen, die leere `reuse()`-Ergebnis abzufangen.

**Status:** ✅ geprüft, keine Änderungen geplant.

---

## 6. Empfehlung: Reihenfolge

1. **B1** (Cursor-Freeze nach Reconnect) — sichtbarster Bug, kleinstes Fix in `client.ts` + T1.
2. **P1** (CursorLayer pro-Frame-Render) — sichtbare Perf, Fix in `cursor.tsx` + T7.
3. **B2/A1** (Lifecycle-Designentscheidung) — große Änderung (alle Integratoren +
   Docs), sollte bewusst geplant werden.
4. **B3** + **B4** (React-Hook-Härtung) — jeweils kleinstes Fix in `hooks.ts`/`provider.tsx`
   + T8/T9.
5. **B5, B6, A2–A7, P2–P4** — kleinere, können in einem Batch.

Jeder Fix bekommt seinen eigenen Commit + Push nach `dev`.
