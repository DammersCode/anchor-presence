// Framework-agnostic security baseline shared by the WebSocket relay examples.
// No helper touches a socket; each server wires them to its own socket API.
import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();
const ROOM_CHARSET = /^[A-Za-z0-9_-]+$/;
const MAX_ROOM_LENGTH = 256;

/** Close code a relay uses when a connection names a room that is not a valid room name. */
export const INVALID_ROOM_CODE = 4007;

/** A query value as a framework reports it: one string, or a list when the client repeats the key. */
export type QueryValue = string | readonly string[] | null | undefined;

function isRepeated(candidate: QueryValue): boolean {
  return typeof candidate === "object" && candidate !== null && candidate.length > 1;
}

function firstValue(candidate: QueryValue): string | null | undefined {
  return typeof candidate === "object" && candidate !== null ? candidate[0] : candidate;
}

/**
 * Reads a room name. A missing or empty value is the default room `main`.
 * A repeated key, a name with other characters, or a name above 256 characters returns `null`: refuse the connection, never merge it into `main`.
 */
export function parseRoom(candidate: QueryValue): string | null {
  if (isRepeated(candidate)) return null;
  const value = firstValue(candidate);
  if (value === null || value === undefined || value === "") return "main";
  return value.length <= MAX_ROOM_LENGTH && ROOM_CHARSET.test(value) ? value : null;
}

/** Reads a token. A missing value is `""`. A repeated key returns `null`: refuse the connection with `4006`. */
export function parseToken(candidate: QueryValue): string | null {
  return isRepeated(candidate) ? null : (firstValue(candidate) ?? "");
}

/** A short random ID that tells the connections of one identity apart. */
export function newConnectionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Constant-time string compare, resistant to timing side-channels on auth tokens. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length, 1);
  const aPadded = new Uint8Array(length);
  const bPadded = new Uint8Array(length);
  aPadded.set(aBytes);
  bPadded.set(bBytes);
  return timingSafeEqual(aPadded, bPadded) && aBytes.length === bBytes.length;
}

/** Byte length of a text or binary message, without a full UTF-8 encode when the length already proves it is over budget. */
export function messageByteLength(message: unknown, maxBytes: number): number {
  if (message instanceof ArrayBuffer || ArrayBuffer.isView(message)) return message.byteLength;
  if (typeof message !== "string") return Number.POSITIVE_INFINITY; // an object has no byte length: over budget
  if (message.length > maxBytes) return message.length;
  if (message.length * 3 <= maxBytes) return message.length;
  return encoder.encode(message).byteLength;
}

export type SlowPeerAction = "send" | "skip" | "close";

/** Backpressure policy for a slow consumer: skip sends above a soft watermark, close above a hard one. */
export function slowPeerAction(
  bufferedAmount: number,
  skipped: boolean,
  softBytes: number,
  hardBytes: number,
  resumeBytes: number,
): SlowPeerAction {
  if (bufferedAmount > hardBytes) return "close";
  if (skipped) return bufferedAmount < resumeBytes ? "send" : "skip";
  return bufferedAmount > softBytes ? "skip" : "send";
}

/** Token-bucket rate limiter for one connection's inbound messages. */
export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefill: number;

  /** `now` returns milliseconds from a monotonic clock; a wall clock that steps back would stall the refill. */
  constructor(capacity: number, refillPerSecond: number, now: () => number = () => performance.now()) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.now = now;
    this.tokens = capacity;
    this.lastRefill = now();
  }

  /** Refills based on elapsed time, then consumes one token. Returns false when the bucket is empty. */
  tryConsume(): boolean {
    const now = this.now();
    const elapsedMs = Math.max(0, now - this.lastRefill);
    this.tokens = Math.min(this.capacity, this.tokens + (elapsedMs / 1000) * this.refillPerSecond);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export type AdmitResult = "ok" | "server full" | "room full";

/** Counts open sockets per process and per room; admits a new socket only while both are below their cap. */
export class ConnectionLimits {
  private readonly maxSockets: number;
  private readonly maxRoomSockets: number;
  private total = 0;
  private readonly roomSizes = new Map<string, number>();

  constructor(maxSockets: number, maxRoomSockets: number) {
    this.maxSockets = maxSockets;
    this.maxRoomSockets = maxRoomSockets;
  }

  /** Takes a slot in `room` on "ok". Call `release(room)` once when that socket closes. */
  admit(room: string): AdmitResult {
    if (this.total >= this.maxSockets) return "server full";
    const size = this.roomSizes.get(room) ?? 0;
    if (size >= this.maxRoomSockets) return "room full";
    this.total += 1;
    this.roomSizes.set(room, size + 1);
    return "ok";
  }

  release(room: string): void {
    const size = this.roomSizes.get(room) ?? 0;
    if (size === 0) return;
    this.total -= 1;
    if (size === 1) this.roomSizes.delete(room);
    else this.roomSizes.set(room, size - 1);
  }
}

/** Reads a comma-separated env var into an origin allowlist. An empty result means "allow every origin" (dev default). */
export function allowedOriginsFromEnv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}

export function originAllowed(allowlist: Set<string>, origin: string): boolean {
  return allowlist.size === 0 || allowlist.has(origin);
}

// receivers drop a clientId above 128 characters, and the relay appends `~` and 8 more
const MAX_IDENTITY_LENGTH = 100;

/** What an auth hook sees: the token, the room, the origin and the request headers. */
export type AuthRequest = {
  token: string;
  room: string;
  origin: string;
  headers: Record<string, string | undefined>;
};

/**
 * Auth hook: decides whether a connection may join. It can be async, for example to verify a JWT or look up a session.
 * A relay without a hook uses the `RELAY_AUTH_TOKEN` check.
 */
export type AuthCheck = (request: AuthRequest) => AuthResult | Promise<AuthResult>;

/** Who the relay says a connection is. A relay that supports it rewrites `clientId` and `user` of every JSON frame to these values. */
export type AuthIdentity = { clientId: string; user?: unknown };

/** `true` admits, `false` refuses, an identity admits and binds the connection to that identity. */
export type AuthResult = boolean | AuthIdentity;

/** Wraps an auth hook so a throw or a rejection counts as a refusal, never as a crash or a hang. */
export function safeAuthCheck(check: AuthCheck): (request: AuthRequest) => Promise<AuthResult> {
  return async (request) => {
    try {
      const result = await check(request);
      if (result === true) return true;
      if (
        typeof result === "object" &&
        result !== null &&
        typeof result.clientId === "string" &&
        result.clientId !== "" &&
        result.clientId.length <= MAX_IDENTITY_LENGTH &&
        // `~` separates the identity from the connection ID that bindIdentity appends
        !result.clientId.includes("~")
      ) {
        return result;
      }
      return false;
    } catch {
      return false;
    }
  };
}

/** Close code and reason of a relay that binds identity when a peer sends a frame it cannot rewrite: a non-JSON frame, such as binaryCodec. */
export const UNBINDABLE_FRAME_CLOSE = { code: 1008, reason: "identity binding needs JSON frames" } as const;

const identityEncoder = new TextEncoder();
const identityDecoder = new TextDecoder();

/**
 * Rewrites a JSON presence frame so it carries the identity the relay verified.
 * The `clientId` gets the connection ID as a suffix, so two tabs of one user stay two clients.
 * Returns `null` for a frame that is not a JSON object, for example a binaryCodec frame: drop it.
 */
export function bindIdentity(
  frame: Uint8Array | string,
  identity: AuthIdentity,
  connectionId: string,
): Uint8Array<ArrayBuffer> | null {
  try {
    const parsed: unknown = JSON.parse(typeof frame === "string" ? frame : identityDecoder.decode(frame));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const message: Record<string, unknown> = {
      ...(parsed as Record<string, unknown>),
      clientId: `${identity.clientId}~${connectionId}`,
    };
    // a bound connection never shows a user the peer chose
    if (identity.user === undefined) delete message.user;
    else message.user = identity.user;
    return identityEncoder.encode(JSON.stringify(message));
  } catch {
    return null;
  }
}

export function tokenAuthCheck(expectedToken: string): AuthCheck {
  if (expectedToken === "") return () => true;
  return (request) => timingSafeEqualString(request.token, expectedToken);
}

export function limitFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Demo identity for the relay entry files: with RELAY_DEMO_IDENTITY=1 the token names the user.
 * A real relay verifies the token, for example as a JWT, and returns the verified user.
 */
export function demoIdentityFromEnv(): AuthCheck | undefined {
  if (process.env.RELAY_DEMO_IDENTITY !== "1") return undefined;
  return ({ token }) => (token === "" ? false : { clientId: `user-${token}`, user: { name: token } });
}

/** Options for a relay entry file: the demo identity when RELAY_DEMO_IDENTITY=1, no auth hook otherwise. */
export function demoIdentityOptions(): { authCheck?: AuthCheck } {
  const check = demoIdentityFromEnv();
  return check === undefined ? {} : { authCheck: check };
}
