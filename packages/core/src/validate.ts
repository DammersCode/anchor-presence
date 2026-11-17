import {
  DEFAULT_MAX_ANCHORS,
  DEFAULT_MAX_ANCHOR_ID_LENGTH,
  DEFAULT_MAX_CLIENT_ID_LENGTH,
  DEFAULT_MAX_FIELD_BYTES,
  DEFAULT_MAX_FIELD_DEPTH,
  DEFAULT_MAX_MESSAGE_BYTES,
  DEFAULT_MAX_SEQUENCE,
  DEFAULT_MAX_SESSION_LENGTH,
} from "./protocol.js";
import type { AnchorPoint, CursorPosition, CursorPresence } from "./protocol.js";

/**
 * Limits for `validatePresence`.
 * Omit a field to keep its default.
 */
export type ValidationLimits = {
  /** Maximum `clientId` length. Default `DEFAULT_MAX_CLIENT_ID_LENGTH`. */
  maxClientIdLength?: number;
  /** Maximum `session` length. Default `DEFAULT_MAX_SESSION_LENGTH`. */
  maxSessionLength?: number;
  /** Maximum `sequence` value. Default `DEFAULT_MAX_SEQUENCE`. */
  maxSequence?: number;
  /** Maximum anchors in one cursor. Default `DEFAULT_MAX_ANCHORS`. */
  maxAnchors?: number;
  /** Maximum anchor `id` length. Default `DEFAULT_MAX_ANCHOR_ID_LENGTH`. */
  maxAnchorIdLength?: number;
  /** Maximum size of `context` or `user` as JSON, in bytes. Default `DEFAULT_MAX_FIELD_BYTES`. */
  maxFieldBytes?: number;
  /** Maximum nesting depth of `context` or `user`. Default `DEFAULT_MAX_FIELD_DEPTH`. */
  maxFieldDepth?: number;
  /** Maximum size of one encoded message, in bytes. Default `DEFAULT_MAX_MESSAGE_BYTES`. */
  maxMessageBytes?: number;
};

type ResolvedLimits = Required<ValidationLimits>;

const DEFAULT_RESOLVED_LIMITS: ResolvedLimits = {
  maxClientIdLength: DEFAULT_MAX_CLIENT_ID_LENGTH,
  maxSessionLength: DEFAULT_MAX_SESSION_LENGTH,
  maxSequence: DEFAULT_MAX_SEQUENCE,
  maxAnchors: DEFAULT_MAX_ANCHORS,
  maxAnchorIdLength: DEFAULT_MAX_ANCHOR_ID_LENGTH,
  maxFieldBytes: DEFAULT_MAX_FIELD_BYTES,
  maxFieldDepth: DEFAULT_MAX_FIELD_DEPTH,
  maxMessageBytes: DEFAULT_MAX_MESSAGE_BYTES,
};

const resolvedLimitsCache = new WeakMap<ValidationLimits, ResolvedLimits>();

function resolveLimits(limits?: ValidationLimits): ResolvedLimits {
  if (limits === undefined) return DEFAULT_RESOLVED_LIMITS;
  let resolved = resolvedLimitsCache.get(limits);
  if (resolved === undefined) {
    resolved = {
      maxClientIdLength: limits.maxClientIdLength ?? DEFAULT_MAX_CLIENT_ID_LENGTH,
      maxSessionLength: limits.maxSessionLength ?? DEFAULT_MAX_SESSION_LENGTH,
      maxSequence: limits.maxSequence ?? DEFAULT_MAX_SEQUENCE,
      maxAnchors: limits.maxAnchors ?? DEFAULT_MAX_ANCHORS,
      maxAnchorIdLength: limits.maxAnchorIdLength ?? DEFAULT_MAX_ANCHOR_ID_LENGTH,
      maxFieldBytes: limits.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES,
      maxFieldDepth: limits.maxFieldDepth ?? DEFAULT_MAX_FIELD_DEPTH,
      maxMessageBytes: limits.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    };
    resolvedLimitsCache.set(limits, resolved);
  }
  return resolved;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return isPlainObject(value) || Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// JSON string length is a lower bound for UTF-8 byte length; exact encoding is only needed near the limit.
function jsonFieldFits(value: unknown, maxBytes: number): boolean {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return true;
    if (json.length > maxBytes) return false;
    if (json.length * 4 <= maxBytes) return true;
    return new TextEncoder().encode(json).length <= maxBytes;
  } catch {
    return false;
  }
}

// Iterative so pathological nesting cannot overflow the call stack; a repeated ancestor means a cycle,
// which JSON.stringify would reject anyway. A `done` frame marks when the container's children finish.
function exceedsMaxDepth(value: unknown, maxDepth: number): boolean {
  type Frame = { value: unknown; depth: number; done: boolean };
  const ancestors = new Set<object>();
  const stack: Frame[] = [{ value, depth: 0, done: false }];
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    if (frame.done) {
      if (isJsonContainer(frame.value)) ancestors.delete(frame.value);
      continue;
    }
    if (!isJsonContainer(frame.value)) continue;
    const nextDepth = frame.depth + 1;
    if (nextDepth > maxDepth) return true;
    const container = frame.value;
    if (ancestors.has(container)) return true;
    ancestors.add(container);
    stack.push({ value: container, depth: nextDepth, done: true });
    const children = Array.isArray(container) ? container : Object.values(container);
    for (const child of children) stack.push({ value: child, depth: nextDepth, done: false });
  }
  return false;
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

/**
 * Returns a validated `CursorPresence` from one decoded message, or `null`.
 * The function enforces every wire limit and never throws.
 * It clamps anchor and viewport values into the `0` to `1` range.
 * @param input The decoded message, from a codec.
 * @param limits Optional limits. The defaults fill the fields you omit.
 * @returns A validated message, or `null` when the message is invalid.
 */
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
    if (
      !isFiniteNumber(sequence) ||
      !Number.isInteger(sequence) ||
      sequence < 0 ||
      sequence > resolved.maxSequence
    ) {
      return null;
    }

    const cursor = validateCursor(input.cursor, resolved);
    if (cursor === undefined) return null;

    const message: CursorPresence<TContext, TUser> = {
      version: 1,
      clientId,
      session,
      sequence,
      cursor,
    };

    if (input.leave === true && cursor === null) message.leave = true;

    if (
      "context" in input &&
      input.context !== undefined &&
      !exceedsMaxDepth(input.context, resolved.maxFieldDepth) &&
      jsonFieldFits(input.context, resolved.maxFieldBytes)
    ) {
      message.context = input.context as TContext;
    }

    if (
      "user" in input &&
      input.user !== undefined &&
      !exceedsMaxDepth(input.user, resolved.maxFieldDepth) &&
      jsonFieldFits(input.user, resolved.maxFieldBytes)
    ) {
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
