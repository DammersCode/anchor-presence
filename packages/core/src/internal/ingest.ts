import { validatePresence } from "../validate.js";
import type { RemoteEvent } from "../protocol.js";
import type { PresenceClientState } from "./types.js";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns `value` cut to the shape of `sample`, or `undefined` when it does not fit.
 * A key of the sample must have the sample's type, or the whole value is dropped.
 * A key the sample lacks, such as an optional field, stays when its value is a string, number, boolean or `null`, and is removed when it is an object or array.
 * A `null` sample or an empty array says nothing about the type, so it accepts a string, number, boolean or `null` and never an object or array.
 * An empty object sample accepts the same extra keys as any other sample.
 */
function isScalar(value: unknown): boolean {
  return (
    value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  );
}

export function fitShape(sample: unknown, value: unknown): unknown {
  if (sample === null || sample === undefined) return isScalar(value) ? value : undefined;
  if (Array.isArray(sample)) {
    if (!Array.isArray(value)) return undefined;
    if (sample.length === 0) return value.every(isScalar) ? value : undefined;
    const fitted = value.map((item) => fitShape(sample[0], item));
    return fitted.includes(undefined) ? undefined : fitted;
  }
  if (isPlainRecord(sample)) {
    if (!isPlainRecord(value)) return undefined;
    const fitted: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      // an own `__proto__` key (JSON.parse makes one) would set the prototype of `fitted` on assignment
      if (key === "__proto__") continue;
      if (Object.hasOwn(sample, key)) {
        const part = fitShape(sample[key], value[key]);
        if (part === undefined) return undefined;
        fitted[key] = part;
      } else if (isScalar(value[key])) {
        fitted[key] = value[key];
      }
    }
    return fitted;
  }
  return typeof value === typeof sample ? value : undefined;
}

// Without a parser, a remote value must look like the local one. A client with no local value has no shape to check against.
function parserFor(explicit: ((value: unknown) => unknown) | undefined, sample: unknown) {
  if (explicit !== undefined) return explicit;
  return sample === undefined ? undefined : (value: unknown) => fitShape(sample, value);
}

function hasUnparsedField<TContext, TUser>(
  state: PresenceClientState<TContext, TUser>,
  presence: { user?: unknown; context?: unknown },
): boolean {
  return (
    (parserFor(state.parseUser, state.user) === undefined && presence.user != null) ||
    (parserFor(state.parseContext, state.context) === undefined && presence.context != null)
  );
}

// A peer that floods events gets dropped, per sender, so one client cannot starve the others.
function createEventAllowance(
  burst = 20,
  refillPerSecond = 10,
  maxSenders = 512,
): { tryConsume(clientId: string): boolean } {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    tryConsume(clientId) {
      const now = Date.now();
      let bucket = buckets.get(clientId);
      if (bucket === undefined) {
        if (buckets.size >= maxSenders) buckets.clear();
        bucket = { tokens: burst, at: now };
        buckets.set(clientId, bucket);
      }
      bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * refillPerSecond);
      bucket.at = now;
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
  };
}

// parseEvent can drop or rewrite an event; a throwing parser drops it
function deliverEvent<TContext, TUser>(
  state: PresenceClientState<TContext, TUser>,
  event: RemoteEvent,
): void {
  if (state.parseEvent === undefined) {
    emitEvent(state, event);
    return;
  }
  try {
    const parsed = state.parseEvent(event);
    if (parsed !== undefined) emitEvent(state, parsed);
  } catch {
    // a throwing parser drops the event
  }
}

function emitEvent<TContext, TUser>(state: PresenceClientState<TContext, TUser>, event: RemoteEvent): void {
  for (const listener of state.eventListeners) {
    try {
      listener(event);
    } catch {
      // one throwing listener must not starve the rest
    }
  }
}

// A field the parser rejects is dropped, so the receiver keeps the previous value.
function parseField(
  presence: { user?: unknown; context?: unknown },
  key: "user" | "context",
  parse: (value: unknown) => unknown,
): void {
  const value = presence[key];
  if (value === undefined || value === null) return;
  try {
    const parsed = parse(value);
    if (parsed === undefined) delete presence[key];
    else presence[key] = parsed;
  } catch {
    delete presence[key];
  }
}

/**
 * Wires the transport inbound stream into the remote store.
 * Oversized, invalid, and self-echoed messages are dropped.
 */
export function wireInbound<TContext, TUser>(state: PresenceClientState<TContext, TUser>): void {
  let warnedUnparsed = false;
  const eventAllowance = createEventAllowance();
  const unsubscribeTransport = state.transport.subscribe((data) => {
    if (state.disposed) return;
    try {
      if (data.byteLength > state.maxMessageBytes) return; // oversized wire message: drop before parsing (spec §4.2)
      const decoded = state.codec.decode(data);
      const presence = validatePresence<TContext, TUser>(decoded, state.validationLimits);
      if (presence === null) return;
      if (presence.clientId === state.clientId) return; // ignore echoes of our own messages
      if (presence.event !== undefined) {
        if (eventAllowance.tryConsume(presence.clientId)) {
          deliverEvent(state, { ...presence.event, clientId: presence.clientId });
        }
        return;
      }
      if (state.devMode && !warnedUnparsed && hasUnparsedField(state, presence)) {
        warnedUnparsed = true;
        console.warn(
          "[anchor-presence] a remote user or context arrived without parseUser or parseContext; a malformed peer value reaches your render. See the security guide.",
        );
      }
      const parseUser = parserFor(state.parseUser, state.user);
      const parseContext = parserFor(state.parseContext, state.context);
      if (parseUser !== undefined) parseField(presence, "user", parseUser);
      if (parseContext !== undefined) parseField(presence, "context", parseContext);
      const known = state.store.has(presence.clientId, presence.session);
      if (state.store.ingest(presence) && !known && presence.leave !== true) state.onNewPeer();
    } catch {
      // a throwing codec or subscriber must not break the transport dispatch loop
    }
  });
  state.teardowns.push(unsubscribeTransport);
}
