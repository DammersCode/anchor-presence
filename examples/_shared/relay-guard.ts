// Framework-agnostic security baseline shared by the WebSocket relay examples.
// Every function is pure or holds only per-connection state; each server wires it to its own socket API.
import { timingSafeEqual } from "node:crypto";

const encoder = new TextEncoder();
const ROOM_CHARSET = /^[A-Za-z0-9_-]+$/;
const MAX_ROOM_LENGTH = 256;

/** Validates a room name: length-capped, restricted charset. Falls back to "main" otherwise. */
export function sanitizeRoomName(candidate: string | null | undefined): string {
  const value = (candidate ?? "").slice(0, MAX_ROOM_LENGTH);
  return value.length > 0 && ROOM_CHARSET.test(value) ? value : "main";
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
export function messageByteLength(message: string | ArrayBufferView | ArrayBuffer, maxBytes: number): number {
  if (typeof message !== "string") return message.byteLength;
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
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
  }

  /** Refills based on elapsed time, then consumes one token. Returns false when the bucket is empty. */
  tryConsume(): boolean {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + (elapsedMs / 1000) * this.refillPerSecond);
      this.lastRefill = now;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
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

/**
 * Auth hook placeholder: verifies a token query param via a user-supplied function.
 * The default accepts everything, matching the reference relay's opt-in auth.
 */
export type AuthCheck = (token: string) => boolean;

export function tokenAuthCheck(expectedToken: string): AuthCheck {
  if (expectedToken === "") return () => true;
  return (token) => timingSafeEqualString(token, expectedToken);
}

export function limitFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
