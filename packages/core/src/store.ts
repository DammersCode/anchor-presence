import type { CursorPresence } from "./protocol";

export const DEFAULT_MAX_REMOTE_CLIENTS = 64;
export const DEFAULT_STALE_TIMEOUT_MS = 70_000;

export type RemotePresenceStoreOptions = {
  maxRemoteClients?: number;
  staleTimeoutMs?: number;
  now?: () => number;
};

type Entry<TContext, TUser> = {
  presence: CursorPresence<TContext, TUser>;
  lastSeenAt: number;
};

/** Sequencing (spec §4.3) + expiry (§4.4) store for remote presences. */
export class RemotePresenceStore<TContext = unknown, TUser = unknown> {
  private readonly maxRemoteClients: number;
  private readonly staleTimeoutMs: number;
  private readonly now: () => number;

  private readonly entries = new Map<string, Entry<TContext, TUser>>();
  private readonly listeners = new Set<() => void>();

  private snapshot: CursorPresence<TContext, TUser>[] = [];
  private snapshotDirty = false;

  constructor(options: RemotePresenceStoreOptions = {}) {
    this.maxRemoteClients = options.maxRemoteClients ?? DEFAULT_MAX_REMOTE_CLIENTS;
    this.staleTimeoutMs = options.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /** Applies an inbound (already-validated) presence message. Returns true if it was accepted. */
  ingest(presence: CursorPresence<TContext, TUser>): boolean {
    const existing = this.entries.get(presence.clientId);

    if (existing === undefined) {
      if (this.entries.size >= this.maxRemoteClients) return false;
      this.entries.set(presence.clientId, { presence, lastSeenAt: this.now() });
      this.markDirty();
      return true;
    }

    const sameSession = existing.presence.session === presence.session;
    if (sameSession && presence.sequence <= existing.presence.sequence) {
      return false;
    }

    existing.presence = presence;
    existing.lastSeenAt = this.now();
    this.markDirty();
    return true;
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
    if (removedAny) this.markDirty();
  }

  remove(clientId: string): void {
    if (this.entries.delete(clientId)) this.markDirty();
  }

  /** Immutable snapshot; a new array identity is returned only when content has changed since the last call. */
  getSnapshot(): CursorPresence<TContext, TUser>[] {
    if (this.snapshotDirty) {
      this.snapshot = Array.from(this.entries.values(), (entry) => entry.presence);
      this.snapshotDirty = false;
    }
    return this.snapshot;
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
