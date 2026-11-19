import type { PresenceMessage } from "./protocol.js";

/**
 * Turns presence messages into bytes, and bytes back into messages.
 * The client runs `validatePresence` on every decoded message.
 */
export interface PresenceCodec {
  /** Encodes one message into bytes. */
  encode(message: PresenceMessage): Uint8Array;
  /** Decodes one message from bytes. Returns `null` on invalid data. */
  decode(data: Uint8Array): unknown;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Codec that encodes messages as JSON text in UTF-8. */
export const jsonCodec: PresenceCodec = {
  encode(message: PresenceMessage): Uint8Array {
    return encoder.encode(JSON.stringify(message));
  },
  decode(data: Uint8Array): unknown {
    try {
      return JSON.parse(decoder.decode(data));
    } catch {
      return null;
    }
  },
};
