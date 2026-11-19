import type { CursorPosition, PresenceMessage } from "../protocol.js";
import { warnOnce } from "./dev-warnings.js";
import { validatePresence } from "../validate.js";
import type { PresenceClientState } from "./types.js";

const PUBLISH_RETRY_INITIAL_MS = 50;
const PUBLISH_RETRY_MAX_MS = 2000;
const NEW_PEER_JITTER_MS = 500;

// Minimal DOM surface; core builds without the DOM lib so this stays a structural type.
type DocumentLike = {
  readonly visibilityState: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

/**
 * The outbound publish pipeline of one presence client.
 * Builds messages, applies the adaptive publish rate, and schedules publishes
 * with an exponential retry backoff on failed sends.
 */
export type PublishLoop = {
  /** Sends one message now. Returns `false` when the message cannot be sent. */
  send: (cursor: CursorPosition | null, includeFull?: boolean, leave?: boolean) => boolean;
  /** Sends one event message now. Returns `false` when the message cannot be sent. */
  sendEvent: (type: string, data?: unknown) => boolean;
  /** Marks a publish pending and schedules one when none is scheduled. */
  markPending: () => void;
  /** Marks a full publish pending after a reconnect and schedules one. */
  markReconnected: () => void;
  /** Schedules one full publish after a short random delay, so a new peer learns this client at once. */
  requestFullPublish: () => void;
  /** Sends the full state on the heartbeat and clears the pending flag on success. */
  sendHeartbeat: () => void;
  /** Flushes a pending publish as soon as the page becomes visible again. */
  wireVisibility: () => void;
};

export function createPublishLoop<TContext, TUser, TEvents extends object>(
  state: PresenceClientState<TContext, TUser, TEvents>,
): PublishLoop {
  function updateSlowMode(): void {
    if (!state.adaptivePublish || typeof state.transport.bufferedBytes !== "function") return;
    try {
      const buffered = state.transport.bufferedBytes();
      if (buffered >= state.highWatermarkBytes) state.slowMode = true;
      else if (buffered <= state.lowWatermarkBytes) state.slowMode = false;
    } catch {
      // a throwing transport probe must not break publishing
    }
  }

  function buildMessage(
    cursor: CursorPosition | null,
    includeFull: boolean,
    leave: boolean,
  ): PresenceMessage<TContext, TUser> {
    const message: PresenceMessage<TContext, TUser> = {
      version: 1,
      clientId: state.clientId,
      session: state.session,
      sequence: state.sequence++,
      cursor,
    };
    if (leave) {
      message.leave = true;
      return message;
    }
    if (state.contextDirty || includeFull) message.context = state.context ?? null;
    if (state.userDirty || includeFull) message.user = state.user ?? null;
    if (state.latestPointer !== undefined) message.pointer = state.latestPointer;
    return message;
  }

  let warnedSendFailure = false;

  // a `user` or `context` that cannot encode must not silence the cursor: resend without them
  function encodeOrDropProfile(message: PresenceMessage<TContext, TUser>): Uint8Array {
    try {
      return state.codec.encode(message);
    } catch (error) {
      if (message.context === undefined && message.user === undefined) throw error;
      warnOnce(
        "unencodable-profile",
        "`user` or `context` could not be encoded, so the client sends the cursor without the failing field. Use plain JSON values.",
      );
      return encodeWithoutFailingField(message);
    }
  }

  // drop one field at a time so a bad `user` keeps a good `context`
  function encodeWithoutFailingField(message: PresenceMessage<TContext, TUser>): Uint8Array {
    const { context, user, ...rest } = message;
    for (const candidate of [
      { ...rest, ...(user === undefined ? {} : { user }) },
      { ...rest, ...(context === undefined ? {} : { context }) },
    ]) {
      try {
        return state.codec.encode(candidate);
      } catch {
        // try the next candidate
      }
    }
    return state.codec.encode(rest);
  }

  function send(cursor: CursorPosition | null, includeFull = false, leave = false): boolean {
    if (state.status !== "connected") return false;
    // peers dropped us on leave, so the next message must carry the full state
    if (!leave && state.left) {
      includeFull = true;
      state.left = false;
    }
    try {
      const message = buildMessage(cursor, includeFull, leave);
      const bytes = encodeOrDropProfile(message);
      const result = state.transport.send(bytes);
      if (result && typeof result.catch === "function") {
        result.catch(() => {});
      }
      updateSlowMode();
      if (message.context !== undefined) state.contextDirty = false;
      if (message.user !== undefined) state.userDirty = false;
      return true;
    } catch (error) {
      if (state.devMode && !warnedSendFailure) {
        warnedSendFailure = true;
        console.warn(
          "[anchor-presence] a message failed to encode or send. Check that `user` and `context` are plain JSON values; a transport send failure can also cause this.",
          error,
        );
      }
      return false;
    }
  }

  function sendEvent(type: string, data?: unknown): boolean {
    if (state.status !== "connected") return false;
    try {
      const message: PresenceMessage<TContext, TUser> = {
        version: 1,
        clientId: state.clientId,
        session: state.session,
        sequence: state.sequence++,
        cursor: null,
        event: data === undefined ? { type } : { type, data },
      };
      // the receiver drops an event above its limits, so refuse it here instead of reporting success
      if (validatePresence(message, state.validationLimits)?.event === undefined) return false;
      const result = state.transport.send(state.codec.encode(message));
      if (result && typeof result.catch === "function") result.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function schedulePublish(retryDelayMs?: number): void {
    if (state.disposed || state.publishTimer !== null) return;
    const interval = retryDelayMs ?? (state.slowMode ? state.slowPublishIntervalMs : state.publishIntervalMs);
    state.publishTimer = state.scheduler.setTimeout(() => {
      state.publishTimer = null;
      if (!state.pendingPublish) return;
      if (send(state.latestCursor, state.pendingFullPublish)) {
        state.pendingPublish = false;
        state.pendingFullPublish = false;
        state.failedSendCount = 0;
      } else if (state.status === "connected") {
        // transient send failure: retry on an exponential backoff instead of hammering a dead transport
        const delay = Math.min(PUBLISH_RETRY_INITIAL_MS * 2 ** state.failedSendCount, PUBLISH_RETRY_MAX_MS);
        state.failedSendCount += 1;
        schedulePublish(delay);
      }
      // while unsendable, pendingPublish stays set; the transition into "connected" re-schedules
    }, interval);
  }

  function markPending(): void {
    state.pendingPublish = true;
    schedulePublish();
  }

  function markReconnected(): void {
    state.pendingPublish = true;
    state.pendingFullPublish = true;
    schedulePublish();
  }

  // own timer: sharing the publish timer would delay ordinary publishes by the jitter
  function requestFullPublish(): void {
    if (state.newPeerTimer !== null) return;
    state.newPeerTimer = state.scheduler.setTimeout(() => {
      state.newPeerTimer = null;
      if (state.disposed) return;
      state.pendingFullPublish = true;
      markPending();
    }, Math.random() * NEW_PEER_JITTER_MS);
  }

  function sendHeartbeat(): void {
    if (send(state.latestCursor, true)) state.pendingPublish = false;
  }

  // browser-only: flush a pending publish as soon as the page becomes visible again
  function wireVisibility(): void {
    const browserDocument = (globalThis as { document?: DocumentLike }).document;
    if (browserDocument === undefined || typeof browserDocument.addEventListener !== "function") return;
    const onVisibilityChange = () => {
      if (state.disposed || browserDocument.visibilityState !== "visible" || !state.pendingPublish) return;
      if (send(state.latestCursor, state.pendingFullPublish)) {
        state.pendingPublish = false;
        state.pendingFullPublish = false;
        state.failedSendCount = 0;
      }
    };
    browserDocument.addEventListener("visibilitychange", onVisibilityChange);
    state.teardowns.push(() => browserDocument.removeEventListener("visibilitychange", onVisibilityChange));
  }

  return { send, sendEvent, markPending, markReconnected, requestFullPublish, sendHeartbeat, wireVisibility };
}
