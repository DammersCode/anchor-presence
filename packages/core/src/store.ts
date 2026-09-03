import type { CursorPosition, CursorPresence, RemotePresence } from "./protocol";

export const DEFAULT_MAX_REMOTE_CLIENTS = 64;
export const DEFAULT_STALE_TIMEOUT_MS = 70_000;

export type RemotePresenceStoreOptions = {
  maxRemoteClients?: number;
  staleTimeoutMs?: number;
  now?: () => number;
  onDropNewClient?: () => void;
};

type Entry<TContext, TUser> = {
  presence: CursorPresence<TContext, TUser>;
  lastSeenAt: number;
  projected: RemotePresence<TContext, TUser>;
};

/** Sequencing (spec §4.3) + expiry (§4.4) store for remote presences. */
export class RemotePresenceStore<TContext = unknown, TUser = unknown> {
  private readonly maxRemoteClients: number;
  private readonly staleTimeoutMs: number;
  private readonly now: () => number;
  private readonly onDropNewClient: (() => void) | undefined;

  private readonly entries = new Map<string, Entry<TContext, TUser>>();
  private readonly listeners = new Set<() => void>();

  private snapshot: CursorPresence<TContext, TUser>[] = [];
  private snapshotDirty = false;

  private stableSnapshot: RemotePresence<TContext, TUser>[] = [];
  private stableSnapshotDirty = false;

  constructor(options: RemotePresenceStoreOptions = {}) {
    this.maxRemoteClients = options.maxRemoteClients ?? DEFAULT_MAX_REMOTE_CLIENTS;
    this.staleTimeoutMs = options.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
    this.onDropNewClient = options.onDropNewClient;
  }

  /** Applies an inbound (already-validated) presence message. Returns true if it was accepted. */
  ingest(presence: CursorPresence<TContext, TUser>): boolean {
    const existing = this.entries.get(presence.clientId);

    if (existing === undefined) {
      if (this.entries.size >= this.maxRemoteClients) {
        this.onDropNewClient?.();
        return false;
      }
      const normalized = this.normalizePresence(presence);
      this.entries.set(presence.clientId, { presence: normalized, lastSeenAt: this.now(), projected: projectPresence(normalized) });
      this.stableSnapshotDirty = true;
      this.markDirty();
      return true;
    }

    const sameSession = existing.presence.session === presence.session;
    if (sameSession && presence.sequence <= existing.presence.sequence) {
      return false;
    }

    const previous = existing.presence;
    const nextPresence = sameSession
      ? this.mergeFields(previous, presence)
      : this.normalizePresence(presence);
    existing.presence = nextPresence;
    existing.lastSeenAt = this.now();
    // a higher-sequence message that changes no observable field keeps the cached projection
    if (!sameObservedPresence(previous, nextPresence)) {
      existing.projected = projectPresence(nextPresence);
      this.stableSnapshotDirty = true;
    }
    this.markDirty();
    return true;
  }

  // A missing field is a delta encoding: keep the previous same-session value. An explicit `null` clears it.
  private mergeFields(
    previous: CursorPresence<TContext, TUser>,
    next: CursorPresence<TContext, TUser>,
  ): CursorPresence<TContext, TUser> {
    const context = resolveFieldDelta(next.context, previous.context);
    const user = resolveFieldDelta(next.user, previous.user);
    const hasOwnContext = "context" in next && next.context === undefined;
    const hasOwnUser = "user" in next && next.user === undefined;
    if (context === next.context && user === next.user && !hasOwnContext && !hasOwnUser) return next;
    return applyFieldDeltas(next, context, user);
  }

  private normalizePresence(presence: CursorPresence<TContext, TUser>): CursorPresence<TContext, TUser> {
    if (!("context" in presence) && !("user" in presence)) return presence;
    const context = resolveFieldDelta(presence.context, undefined);
    const user = resolveFieldDelta(presence.user, undefined);
    return applyFieldDeltas(presence, context, user);
  }

  /** Removes entries not seen for staleTimeoutMs. Call periodically (e.g. from a client heartbeat timer). */
  sweep(): void {
    const cutoff = this.now() - this.staleTimeoutMs;
    let removedAny = false;
    for (const [clientId, entry] of this.entries) {
      if (entry.lastSeenAt < cutoff) {
        this.entries.delete(clientId);
        removedAny = true;
      }
    }
    if (removedAny) {
      this.stableSnapshotDirty = true;
      this.markDirty();
    }
  }

  remove(clientId: string): void {
    if (this.entries.delete(clientId)) {
      this.stableSnapshotDirty = true;
      this.markDirty();
    }
  }

  /** Raw snapshot including `sequence`; new array identity per accepted ingest. */
  getSnapshot(): CursorPresence<TContext, TUser>[] {
    if (this.snapshotDirty) {
      this.snapshot = Array.from(this.entries.values(), (entry) => entry.presence);
      this.snapshotDirty = false;
    }
    return this.snapshot;
  }

  /** Render-stable snapshot: `sequence` excluded, entry and array identity hold until observable fields change. */
  getStableSnapshot(): RemotePresence<TContext, TUser>[] {
    if (this.stableSnapshotDirty) {
      this.stableSnapshot = Array.from(this.entries.values(), (entry) => entry.projected);
      this.stableSnapshotDirty = false;
    }
    return this.stableSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private markDirty(): void {
    this.snapshotDirty = true;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // one throwing subscriber must not starve the rest
      }
    }
  }
}

// Wire encoding: `null` clears the field, `undefined` inherits the previous same-session value.
function resolveFieldDelta<T>(
  next: T | null | undefined,
  previous: T | null | undefined,
): T | undefined {
  if (next === null) return undefined;
  if (next !== undefined) return next;
  if (previous === null) return undefined;
  return previous;
}

// A resolved `undefined` must not become an own property: public presences omit empty fields.
function applyFieldDeltas<TContext, TUser>(
  base: CursorPresence<TContext, TUser>,
  context: TContext | undefined,
  user: TUser | undefined,
): CursorPresence<TContext, TUser> {
  const result: CursorPresence<TContext, TUser> = { ...base };
  if (context === undefined) delete result.context;
  else result.context = context;
  if (user === undefined) delete result.user;
  else result.user = user;
  return result;
}

function projectPresence<TContext, TUser>(
  presence: CursorPresence<TContext, TUser>,
): RemotePresence<TContext, TUser> {
  const projected: RemotePresence<TContext, TUser> = {
    version: presence.version,
    clientId: presence.clientId,
    session: presence.session,
    cursor: presence.cursor,
  };
  if ("context" in presence) projected.context = presence.context;
  if ("user" in presence) projected.user = presence.user;
  if ("pointer" in presence) projected.pointer = presence.pointer;
  return projected;
}

// `sequence` is excluded on purpose: it advances with every accepted message.
function sameObservedPresence<TContext, TUser>(
  a: CursorPresence<TContext, TUser>,
  b: CursorPresence<TContext, TUser>,
): boolean {
  if (a.session !== b.session) return false;
  if (!sameCursor(a.cursor, b.cursor)) return false;
  if (!Object.is(a.context, b.context)) return false;
  if (!Object.is(a.user, b.user)) return false;
  return a.pointer?.type === b.pointer?.type;
}

function sameCursor(a: CursorPosition | null, b: CursorPosition | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.anchors.length !== b.anchors.length) return false;
  for (let i = 0; i < a.anchors.length; i++) {
    const pa = a.anchors[i];
    const pb = b.anchors[i];
    if (pa === undefined || pb === undefined) return false;
    if (pa.id !== pb.id || pa.u !== pb.u || pa.v !== pb.v) return false;
  }
  if (a.viewport !== b.viewport) {
    if (a.viewport === undefined || b.viewport === undefined) return false;
    if (a.viewport.u !== b.viewport.u || a.viewport.v !== b.viewport.v) return false;
  }
  return true;
}
