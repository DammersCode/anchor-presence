import type { CursorPosition, PresenceMessage, PeerChange, RemotePresence } from "./protocol.js";
import { defaultNow } from "./internal/clock.js";
import { reportListenerError } from "./internal/dev-warnings.js";

/** Default maximum number of remote clients in one `RemotePresenceStore`. */
export const DEFAULT_MAX_REMOTE_CLIENTS = 64;

/** Default time before a remote client counts as stale, in milliseconds. */
export const DEFAULT_STALE_TIMEOUT_MS = 70_000;

/** Default time before a remote client counts as idle, in milliseconds. Below `staleTimeoutMs`. */
export const DEFAULT_IDLE_AFTER_MS = 15_000;

/**
 * Options for `RemotePresenceStore`.
 * Omit every field to keep the defaults.
 */
export type RemotePresenceStoreOptions = {
  /** Maximum number of remote clients. Default `DEFAULT_MAX_REMOTE_CLIENTS`. */
  maxRemoteClients?: number;
  /** Time before a client counts as stale, in milliseconds. Default `DEFAULT_STALE_TIMEOUT_MS`. */
  staleTimeoutMs?: number;
  /** Time before a client counts as idle, in milliseconds. Default `DEFAULT_IDLE_AFTER_MS`, clamped below `staleTimeoutMs`. */
  idleAfterMs?: number;
  /** Returns the current time in milliseconds. Default: `performance.now()`, or `Date.now()` without `performance`. */
  now?: () => number;
  /** Runs when the store drops a new client because the store is full. */
  onRemoteClientRejected?: (info: { clientId: string }) => void;
};

type Entry<TContext, TUser> = {
  presence: PresenceMessage<TContext, TUser>;
  lastSeenAt: number;
  changedAt: number;
  idle: boolean;
  projected: RemotePresence<TContext, TUser>;
};

/**
 * Store for the remote presences one client receives.
 * The store drops a same-session message when its sequence is not higher than the stored value.
 * When the store is full, it drops a new `clientId` and calls `onRemoteClientRejected`.
 */
export class RemotePresenceStore<TContext = unknown, TUser = unknown> {
  private readonly maxRemoteClients: number;
  private readonly staleTimeoutMs: number;
  private readonly idleAfterMs: number;
  private readonly now: () => number;
  private readonly onRemoteClientRejected: ((info: { clientId: string }) => void) | undefined;

  private readonly entries = new Map<string, Entry<TContext, TUser>>();
  private readonly listeners = new Set<() => void>();
  private readonly peerListeners = new Set<(change: PeerChange<TContext, TUser>) => void>();

  private snapshot: PresenceMessage<TContext, TUser>[] = [];
  private snapshotDirty = false;

  private stableSnapshot: RemotePresence<TContext, TUser>[] = [];
  private stableSnapshotDirty = false;

  // O(1) "does any client have a cursor?" without scanning the entries on every inbound message
  private activeCursorCount = 0;

  /** Creates a store with the given options. */
  constructor(options: RemotePresenceStoreOptions = {}) {
    this.maxRemoteClients = options.maxRemoteClients ?? DEFAULT_MAX_REMOTE_CLIENTS;
    this.staleTimeoutMs = options.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
    // idleAfterMs must stay below staleTimeoutMs: idle is an earlier stage, not a replacement
    this.idleAfterMs = Math.min(options.idleAfterMs ?? DEFAULT_IDLE_AFTER_MS, this.staleTimeoutMs - 1);
    this.now = options.now ?? defaultNow;
    this.onRemoteClientRejected = options.onRemoteClientRejected;
  }

  /**
   * Applies one validated inbound message.
   * The store drops a same-session message with a sequence not higher than the stored value.
   * @param presence The validated inbound message.
   * @returns `true` when the store accepted the message.
   */
  ingest(presence: PresenceMessage<TContext, TUser>): boolean {
    const existing = this.entries.get(presence.clientId);

    if (existing === undefined) {
      if (presence.leave === true) return false;
      if (this.entries.size >= this.maxRemoteClients) {
        this.onRemoteClientRejected?.({ clientId: presence.clientId });
        return false;
      }
      const normalized = this.normalizePresence(presence);
      this.entries.set(presence.clientId, {
        presence: normalized,
        lastSeenAt: this.now(),
        changedAt: this.now(),
        idle: false,
        projected: projectPresence(normalized, false),
      });
      if (normalized.cursor !== null) this.activeCursorCount += 1;
      this.stableSnapshotDirty = true;
      this.markDirty();
      this.notifyPeer("join", normalized);
      return true;
    }

    const sameSession = existing.presence.session === presence.session;
    if (presence.leave === true) {
      if (!sameSession || presence.sequence <= existing.presence.sequence) return false;
      this.remove(presence.clientId);
      return true;
    }
    if (sameSession && presence.sequence <= existing.presence.sequence) {
      return false;
    }

    const previous = existing.presence;
    const nextPresence = sameSession
      ? this.mergeFields(previous, presence)
      : this.normalizePresence(presence);
    const hadCursor = previous.cursor !== null;
    const hasCursor = nextPresence.cursor !== null;
    if (hadCursor !== hasCursor) this.activeCursorCount += hasCursor ? 1 : -1;
    existing.presence = nextPresence;
    existing.lastSeenAt = this.now();
    // a heartbeat that changes nothing observable must not end idle
    // a returning clientId with a new session counts as changed when its user differs by value
    const profileChanged = sameSession
      ? !Object.is(previous.user, nextPresence.user) || !Object.is(previous.context, nextPresence.context)
      : !jsonEqual(previous.user, nextPresence.user) || !jsonEqual(previous.context, nextPresence.context);
    if (!sameObservedPresence(previous, nextPresence)) {
      existing.changedAt = existing.lastSeenAt;
      existing.idle = false;
      existing.projected = projectPresence(nextPresence, false);
      this.stableSnapshotDirty = true;
    }
    this.markDirty();
    if (profileChanged) this.notifyPeer("update", nextPresence);
    return true;
  }

  // A missing field is a delta encoding: keep the previous same-session value. An explicit `null` clears it.
  private mergeFields(
    previous: PresenceMessage<TContext, TUser>,
    next: PresenceMessage<TContext, TUser>,
  ): PresenceMessage<TContext, TUser> {
    const context = keepIdentity(resolveFieldDelta(next.context, previous.context), previous.context);
    const user = keepIdentity(resolveFieldDelta(next.user, previous.user), previous.user);
    const hasOwnContext = "context" in next && next.context === undefined;
    const hasOwnUser = "user" in next && next.user === undefined;
    if (context === next.context && user === next.user && !hasOwnContext && !hasOwnUser) return next;
    return applyFieldDeltas(next, context, user);
  }

  private normalizePresence(presence: PresenceMessage<TContext, TUser>): PresenceMessage<TContext, TUser> {
    if (!("context" in presence) && !("user" in presence)) return presence;
    const context = resolveFieldDelta(presence.context);
    const user = resolveFieldDelta(presence.user);
    return applyFieldDeltas(presence, context, user);
  }

  /**
   * Removes clients with no message for `staleTimeoutMs`, and marks clients idle after `idleAfterMs`.
   * If you use the store without a client, run this on a timer.
   */
  sweep(): void {
    const now = this.now();
    const staleCutoff = now - this.staleTimeoutMs;
    const idleCutoff = now - this.idleAfterMs;
    let changedAny = false;
    for (const [clientId, entry] of this.entries) {
      if (entry.lastSeenAt < staleCutoff) {
        if (entry.presence.cursor !== null) this.activeCursorCount -= 1;
        this.entries.delete(clientId);
        changedAny = true;
        this.notifyPeer("leave", entry.presence);
        continue;
      }
      const shouldBeIdle = entry.changedAt < idleCutoff;
      if (shouldBeIdle !== entry.idle) {
        entry.idle = shouldBeIdle;
        entry.projected = projectPresence(entry.presence, shouldBeIdle);
        changedAny = true;
      }
    }
    if (changedAny) {
      this.stableSnapshotDirty = true;
      this.markDirty();
    }
  }

  /** Returns whether the store holds an entry for `clientId`, and for `session` when you pass one. */
  has(clientId: string, session?: string): boolean {
    const entry = this.entries.get(clientId);
    return entry !== undefined && (session === undefined || entry.presence.session === session);
  }

  /**
   * Removes one client from the store.
   * Removing a client that is not present changes nothing.
   * @param clientId The client to remove.
   */
  remove(clientId: string): void {
    const entry = this.entries.get(clientId);
    if (entry !== undefined) {
      if (entry.presence.cursor !== null) this.activeCursorCount -= 1;
      this.entries.delete(clientId);
      this.stableSnapshotDirty = true;
      this.markDirty();
      this.notifyPeer("leave", entry.presence);
    }
  }

  /**
   * Marks every stored client unconfirmed: the sweep removes it unless a message arrives within `graceMs`.
   * The client calls this after a reconnect, because a peer may have left while the connection was down.
   */
  expireUnlessRefreshed(graceMs: number): void {
    const deadline = this.now() - this.staleTimeoutMs + graceMs;
    for (const entry of this.entries.values()) {
      if (entry.lastSeenAt > deadline) entry.lastSeenAt = deadline;
    }
  }

  /**
   * Adds a listener for clients that join or leave the store.
   * A client joins on its first accepted message, and leaves on a leave message, a removal, or the stale timeout.
   * It updates when its `user` or `context` changes.
   * @returns A function that removes the listener.
   */
  subscribePeers(listener: (change: PeerChange<TContext, TUser>) => void): () => void {
    this.peerListeners.add(listener);
    return () => {
      this.peerListeners.delete(listener);
    };
  }

  /**
   * Returns whether at least one stored client has a cursor position.
   * The store keeps a count, so this is O(1).
   */
  hasActiveCursors(): boolean {
    return this.activeCursorCount > 0;
  }

  /**
   * Returns the raw remote snapshot, including `sequence`.
   * The store returns a new array when it accepts a message.
   */
  getSnapshot(): PresenceMessage<TContext, TUser>[] {
    if (this.snapshotDirty) {
      this.snapshot = Array.from(this.entries.values(), (entry) => entry.presence);
      this.snapshotDirty = false;
    }
    return this.snapshot;
  }

  /**
   * Returns the stable remote snapshot, without `sequence`.
   * The store keeps the array and entry identity while nothing observable changes.
   * Use this for rendering. Use `getSnapshot()` to watch `sequence`.
   */
  getStableSnapshot(): RemotePresence<TContext, TUser>[] {
    if (this.stableSnapshotDirty) {
      this.stableSnapshot = Array.from(this.entries.values(), (entry) => entry.projected);
      this.stableSnapshotDirty = false;
    }
    return this.stableSnapshot;
  }

  /**
   * Adds a listener for store changes.
   * The store calls the listener on every accepted message and on every removal.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyPeer(type: PeerChange["type"], presence: PresenceMessage<TContext, TUser>): void {
    const change: PeerChange<TContext, TUser> = { type, clientId: presence.clientId };
    if (presence.user != null) change.user = presence.user;
    if (presence.context != null) change.context = presence.context;
    for (const listener of this.peerListeners) {
      try {
        listener(change);
      } catch (error) {
        reportListenerError(error);
      }
    }
  }

  private markDirty(): void {
    this.snapshotDirty = true;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        reportListenerError(error);
      }
    }
  }
}

// A heartbeat decodes to new but equal objects; reuse the previous one so identity checks hold.
function keepIdentity<T>(next: T | undefined, previous: T | null | undefined): T | undefined {
  return next !== undefined && previous != null && jsonEqual(next, previous) ? previous : next;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) => key in b && jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

// Wire encoding: `null` clears the field, `undefined` inherits the previous same-session value.
function resolveFieldDelta<T>(next: T | null | undefined, previous?: T | null): T | undefined {
  if (next === null) return undefined;
  if (next !== undefined) return next;
  if (previous === null) return undefined;
  return previous;
}

// A resolved `undefined` must not become an own property: public presences omit empty fields.
function applyFieldDeltas<TContext, TUser>(
  base: PresenceMessage<TContext, TUser>,
  context: TContext | undefined,
  user: TUser | undefined,
): PresenceMessage<TContext, TUser> {
  const result: PresenceMessage<TContext, TUser> = { ...base };
  if (context === undefined) delete result.context;
  else result.context = context;
  if (user === undefined) delete result.user;
  else result.user = user;
  return result;
}

function projectPresence<TContext, TUser>(
  presence: PresenceMessage<TContext, TUser>,
  idle: boolean,
): RemotePresence<TContext, TUser> {
  const projected: RemotePresence<TContext, TUser> = {
    version: presence.version,
    clientId: presence.clientId,
    session: presence.session,
    cursor: presence.cursor,
    idle,
  };
  if ("context" in presence) projected.context = presence.context;
  if ("user" in presence) projected.user = presence.user;
  if ("pointer" in presence) projected.pointer = presence.pointer;
  return projected;
}

// `sequence` is excluded on purpose: it advances with every accepted message.
function sameObservedPresence<TContext, TUser>(
  a: PresenceMessage<TContext, TUser>,
  b: PresenceMessage<TContext, TUser>,
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
