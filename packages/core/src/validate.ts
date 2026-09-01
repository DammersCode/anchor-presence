import {
  DEFAULT_MAX_ANCHORS,
  DEFAULT_MAX_ANCHOR_ID_LENGTH,
  DEFAULT_MAX_CLIENT_ID_LENGTH,
  DEFAULT_MAX_FIELD_BYTES,
  DEFAULT_MAX_MESSAGE_BYTES,
  DEFAULT_MAX_SESSION_LENGTH,
} from "./protocol";
import type { AnchorPoint, CursorPosition, CursorPresence } from "./protocol";

export type ValidationLimits = {
  maxClientIdLength?: number;
  maxSessionLength?: number;
  maxAnchors?: number;
  maxAnchorIdLength?: number;
  maxFieldBytes?: number;
  maxMessageBytes?: number;
};

type ResolvedLimits = Required<ValidationLimits>;

function resolveLimits(limits?: ValidationLimits): ResolvedLimits {
  return {
    maxClientIdLength: limits?.maxClientIdLength ?? DEFAULT_MAX_CLIENT_ID_LENGTH,
    maxSessionLength: limits?.maxSessionLength ?? DEFAULT_MAX_SESSION_LENGTH,
    maxAnchors: limits?.maxAnchors ?? DEFAULT_MAX_ANCHORS,
    maxAnchorIdLength: limits?.maxAnchorIdLength ?? DEFAULT_MAX_ANCHOR_ID_LENGTH,
    maxFieldBytes: limits?.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES,
    maxMessageBytes: limits?.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function byteLengthOf(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return 0;
    return new TextEncoder().encode(json).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function validateAnchorPoint(input: unknown, limits: ResolvedLimits): AnchorPoint | null {
  if (!isPlainObject(input)) return null;
  const { id, u, v } = input;
  if (typeof id !== "string" || id.length < 1 || id.length > limits.maxAnchorIdLength) {
    return null;
  }
  if (!isFiniteNumber(u) || !isFiniteNumber(v)) return null;
  return { id, u: clamp01(u), v: clamp01(v) };
}

function validateViewport(input: unknown): { u: number; v: number } | undefined {
  if (!isPlainObject(input)) return undefined;
  const { u, v } = input;
  if (!isFiniteNumber(u) || !isFiniteNumber(v)) return undefined;
  return { u: clamp01(u), v: clamp01(v) };
}

function validateCursor(input: unknown, limits: ResolvedLimits): CursorPosition | null | undefined {
  if (input === null) return null;
  if (!isPlainObject(input)) return undefined;

  const rawAnchors = input.anchors;
  if (!Array.isArray(rawAnchors)) return undefined;

  const truncated = rawAnchors.slice(0, limits.maxAnchors);
  const anchors: AnchorPoint[] = [];
  for (const rawAnchor of truncated) {
    const anchor = validateAnchorPoint(rawAnchor, limits);
    if (anchor !== null) anchors.push(anchor);
  }

  const cursor: CursorPosition = { anchors };
  const viewport = validateViewport(input.viewport);
  if (viewport !== undefined) cursor.viewport = viewport;
  return cursor;
}

/** Decodes and enforces every rule in spec §4.2. Never throws; returns null for anything unusable. */
export function validatePresence<TContext = unknown, TUser = unknown>(
  input: unknown,
  limits?: ValidationLimits,
): CursorPresence<TContext, TUser> | null {
  try {
    // whole-message 32 KiB limit is enforced on wire bytes by the client, before decode (spec §4.2)
    if (!isPlainObject(input)) return null;

    const resolved = resolveLimits(limits);

    if (input.version !== 1) return null;

    const { clientId, session, sequence } = input;
    if (typeof clientId !== "string" || clientId.length < 1 || clientId.length > resolved.maxClientIdLength) {
      return null;
    }
    if (typeof session !== "string" || session.length < 1 || session.length > resolved.maxSessionLength) {
      return null;
    }
    if (!isFiniteNumber(sequence) || !Number.isInteger(sequence) || sequence < 0) return null;

    const cursor = validateCursor(input.cursor, resolved);
    if (cursor === undefined) return null;

    const message: CursorPresence<TContext, TUser> = {
      version: 1,
      clientId,
      session,
      sequence,
      cursor,
    };

    if ("context" in input && input.context !== undefined && byteLengthOf(input.context) <= resolved.maxFieldBytes) {
      message.context = input.context as TContext;
    }

    if ("user" in input && input.user !== undefined && byteLengthOf(input.user) <= resolved.maxFieldBytes) {
      message.user = input.user as TUser;
    }

    const pointer = input.pointer;
    if (isPlainObject(pointer)) {
      const type = pointer.type;
      if (type === "mouse" || type === "pen" || type === "touch") {
        message.pointer = { type };
      } else if (type === undefined) {
        message.pointer = {};
      }
    }

    return message;
  } catch {
    return null;
  }
}
