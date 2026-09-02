import type { CursorCodec } from "./codec";
import type { CursorPosition, CursorPresence, PointerInfo } from "./protocol";

const MAGIC = 0x41;
const FORMAT = 2;
const PROTOCOL_VERSION = 1;

const CURSOR_NULL = 0;
const CURSOR_PRESENT = 1;
const VIEWPORT_ABSENT = 0;
const VIEWPORT_PRESENT = 1;

const POINTER_ABSENT = 0;
const POINTER_PRESENT_NO_TYPE = 1;
const POINTER_MOUSE = 2;
const POINTER_PEN = 3;
const POINTER_TOUCH = 4;

const FIELD_ABSENT = 0;
const FIELD_NULL = 1;
const FIELD_JSON = 2;

const EMPTY = new Uint8Array(0);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type JsonField = { tag: number; bytes: Uint8Array };
type DecodedField = { present: boolean; value: unknown };

function encodeJsonField(value: unknown): JsonField {
  if (value === undefined) return { tag: FIELD_ABSENT, bytes: EMPTY };
  if (value === null) return { tag: FIELD_NULL, bytes: EMPTY };
  const json = JSON.stringify(value);
  if (typeof json !== "string") throw new Error("binaryCodec: cannot encode field as JSON");
  const bytes = encoder.encode(json);
  if (bytes.byteLength > 0xffffffff) throw new Error("binaryCodec: JSON field too large");
  return { tag: FIELD_JSON, bytes };
}

function jsonFieldSize(field: JsonField): number {
  return field.tag === FIELD_JSON ? 4 + field.bytes.byteLength : 0;
}

function pointerTagFor(pointer: PointerInfo | undefined): number {
  if (pointer === undefined) return POINTER_ABSENT;
  if (pointer.type === undefined) return POINTER_PRESENT_NO_TYPE;
  switch (pointer.type) {
    case "mouse":
      return POINTER_MOUSE;
    case "pen":
      return POINTER_PEN;
    case "touch":
      return POINTER_TOUCH;
    default:
      throw new Error("binaryCodec: unsupported pointer type");
  }
}

function pointerFromTag(tag: number): PointerInfo | undefined {
  switch (tag) {
    case POINTER_ABSENT:
      return undefined;
    case POINTER_PRESENT_NO_TYPE:
      return {};
    case POINTER_MOUSE:
      return { type: "mouse" };
    case POINTER_PEN:
      return { type: "pen" };
    case POINTER_TOUCH:
      return { type: "touch" };
    default:
      throw new Error("binaryCodec: invalid pointer tag");
  }
}

function encodeMessage(message: CursorPresence): Uint8Array {
  if (message.version !== 1) throw new Error("binaryCodec: unsupported protocol version");

  const clientIdBytes = encoder.encode(message.clientId);
  if (clientIdBytes.byteLength > 0xffff) throw new Error("binaryCodec: clientId too large");
  const sessionBytes = encoder.encode(message.session);
  if (sessionBytes.byteLength > 0xffff) throw new Error("binaryCodec: session too large");
  if (!Number.isSafeInteger(message.sequence) || message.sequence < 0 || message.sequence > 0xffffffff) {
    throw new Error("binaryCodec: sequence out of range");
  }

  const cursor = message.cursor;
  let cursorSize = 1;
  const anchorParts: { id: Uint8Array; u: number; v: number }[] = [];
  let hasViewport = false;
  let viewport = { u: 0, v: 0 };

  if (cursor === null) {
    // No cursor payload beyond the tag byte.
  } else {
    if (!Array.isArray(cursor.anchors)) throw new Error("binaryCodec: invalid cursor");
    if (cursor.anchors.length > 0xff) throw new Error("binaryCodec: too many anchors");
    cursorSize += 1;
    for (const anchor of cursor.anchors) {
      const id = encoder.encode(anchor.id);
      if (id.byteLength > 0xffff) throw new Error("binaryCodec: anchor id too large");
      if (!Number.isFinite(anchor.u) || !Number.isFinite(anchor.v)) throw new Error("binaryCodec: invalid anchor");
      anchorParts.push({ id, u: anchor.u, v: anchor.v });
      cursorSize += 2 + id.byteLength + 8;
    }
    const viewportValue = cursor.viewport;
    hasViewport = viewportValue !== undefined;
    if (viewportValue !== undefined) {
      if (!Number.isFinite(viewportValue.u) || !Number.isFinite(viewportValue.v)) {
        throw new Error("binaryCodec: invalid viewport");
      }
      viewport = { u: viewportValue.u, v: viewportValue.v };
    }
    cursorSize += 1 + (hasViewport ? 8 : 0);
  }

  const pointerTag = pointerTagFor(message.pointer);
  const context = encodeJsonField(message.context);
  const user = encodeJsonField(message.user);

  const total =
    3 +
    2 +
    clientIdBytes.byteLength +
    2 +
    sessionBytes.byteLength +
    4 +
    cursorSize +
    1 +
    1 +
    jsonFieldSize(context) +
    1 +
    jsonFieldSize(user);

  const bytes = new Uint8Array(total);
  const dv = new DataView(bytes.buffer);
  bytes[0] = MAGIC;
  bytes[1] = FORMAT;
  bytes[2] = PROTOCOL_VERSION;

  let offset = 3;
  dv.setUint16(offset, clientIdBytes.byteLength, true);
  offset += 2;
  bytes.set(clientIdBytes, offset);
  offset += clientIdBytes.byteLength;

  dv.setUint16(offset, sessionBytes.byteLength, true);
  offset += 2;
  bytes.set(sessionBytes, offset);
  offset += sessionBytes.byteLength;

  dv.setUint32(offset, message.sequence, true);
  offset += 4;

  if (cursor === null) {
    bytes[offset++] = CURSOR_NULL;
  } else {
    bytes[offset++] = CURSOR_PRESENT;
    bytes[offset++] = anchorParts.length;
    for (const anchor of anchorParts) {
      dv.setUint16(offset, anchor.id.byteLength, true);
      offset += 2;
      bytes.set(anchor.id, offset);
      offset += anchor.id.byteLength;
      dv.setFloat32(offset, anchor.u, true);
      offset += 4;
      dv.setFloat32(offset, anchor.v, true);
      offset += 4;
    }
    if (hasViewport) {
      bytes[offset++] = VIEWPORT_PRESENT;
      dv.setFloat32(offset, viewport.u, true);
      offset += 4;
      dv.setFloat32(offset, viewport.v, true);
      offset += 4;
    } else {
      bytes[offset++] = VIEWPORT_ABSENT;
    }
  }

  bytes[offset++] = pointerTag;

  bytes[offset++] = context.tag;
  if (context.tag === FIELD_JSON) {
    dv.setUint32(offset, context.bytes.byteLength, true);
    offset += 4;
    bytes.set(context.bytes, offset);
    offset += context.bytes.byteLength;
  }

  bytes[offset++] = user.tag;
  if (user.tag === FIELD_JSON) {
    dv.setUint32(offset, user.bytes.byteLength, true);
    offset += 4;
    bytes.set(user.bytes, offset);
    offset += user.bytes.byteLength;
  }

  if (offset !== bytes.byteLength) throw new Error("binaryCodec: encoding size mismatch");
  return bytes;
}

function decodeMessage(data: Uint8Array): unknown {
  if (data.byteLength < 3) return null;
  if (data[0] !== MAGIC || data[1] !== FORMAT || data[2] !== PROTOCOL_VERSION) return null;

  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 3;

  const readString = (): string => {
    const length = dv.getUint16(offset, true);
    offset += 2;
    if (offset + length > data.byteLength) throw new Error("truncated string");
    const value = decoder.decode(data.subarray(offset, offset + length));
    offset += length;
    return value;
  };

  const readJsonField = (): DecodedField => {
    const tag = dv.getUint8(offset++);
    if (tag === FIELD_ABSENT) return { present: false, value: undefined };
    if (tag === FIELD_NULL) return { present: true, value: null };
    if (tag === FIELD_JSON) {
      const length = dv.getUint32(offset, true);
      offset += 4;
      if (offset + length > data.byteLength) throw new Error("truncated JSON field");
      const value = JSON.parse(decoder.decode(data.subarray(offset, offset + length)));
      offset += length;
      return { present: true, value };
    }
    throw new Error("invalid JSON field tag");
  };

  const clientId = readString();
  const session = readString();
  const sequence = dv.getUint32(offset, true);
  offset += 4;

  const cursorTag = dv.getUint8(offset++);
  let cursor: CursorPosition | null;
  if (cursorTag === CURSOR_NULL) {
    cursor = null;
  } else if (cursorTag === CURSOR_PRESENT) {
    const anchorCount = dv.getUint8(offset++);
    const anchors: CursorPosition["anchors"] = [];
    for (let i = 0; i < anchorCount; i++) {
      const id = readString();
      const u = dv.getFloat32(offset, true);
      offset += 4;
      const v = dv.getFloat32(offset, true);
      offset += 4;
      if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error("invalid anchor coordinate");
      anchors.push({ id, u, v });
    }

    const viewportTag = dv.getUint8(offset++);
    const position: CursorPosition = { anchors };
    if (viewportTag === VIEWPORT_PRESENT) {
      const u = dv.getFloat32(offset, true);
      offset += 4;
      const v = dv.getFloat32(offset, true);
      offset += 4;
      if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error("invalid viewport coordinate");
      position.viewport = { u, v };
    } else if (viewportTag !== VIEWPORT_ABSENT) {
      throw new Error("invalid viewport tag");
    }
    cursor = position;
  } else {
    throw new Error("invalid cursor tag");
  }

  const pointer = pointerFromTag(dv.getUint8(offset++));
  const context = readJsonField();
  const user = readJsonField();

  if (offset !== data.byteLength) throw new Error("trailing bytes");

  const message: Record<string, unknown> = { version: PROTOCOL_VERSION, clientId, session, sequence, cursor };
  if (pointer !== undefined) message.pointer = pointer;
  if (context.present) message.context = context.value;
  if (user.present) message.user = user.value;
  return message;
}

export const binaryCodec: CursorCodec = {
  encode(message: CursorPresence): Uint8Array {
    return encodeMessage(message);
  },
  decode(data: Uint8Array): unknown {
    try {
      return decodeMessage(data);
    } catch {
      return null;
    }
  },
};
