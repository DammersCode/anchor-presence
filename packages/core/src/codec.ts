import type { CursorPresence } from "./protocol";

// Codec abstraction — spec §6
export interface CursorCodec {
  encode(message: CursorPresence): Uint8Array;
  decode(data: Uint8Array): unknown; // validated afterwards by core, never throws
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const jsonCodec: CursorCodec = {
  encode(message: CursorPresence): Uint8Array {
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
