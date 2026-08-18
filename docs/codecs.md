# Codecs

A codec turns a `CursorPresence` message into bytes for the wire, and turns bytes back into a value. This page covers the `CursorCodec` interface, the shipped `jsonCodec`, a MessagePack sketch, and the validation boundary.

## CursorCodec

```ts
import type { CursorCodec } from "@anchor-presence/core";

interface CursorCodec {
  encode(message: CursorPresence): Uint8Array;
  decode(data: Uint8Array): unknown; // validated afterwards by core
}
```

`decode` returns `unknown`, not `CursorPresence`. A codec must never throw past the decode boundary; malformed input must produce a value that fails validation, not an exception.

Pass a codec to `createPresenceClient`:

```ts
const client = createPresenceClient({ transport: myTransport, codec: myCodec });
```

## jsonCodec

`@anchor-presence/core` ships `jsonCodec`, the default codec:

```ts
import { jsonCodec } from "@anchor-presence/core";

export const jsonCodec: CursorCodec = {
  encode(message) {
    return new TextEncoder().encode(JSON.stringify(message));
  },
  decode(data) {
    try {
      return JSON.parse(new TextDecoder().decode(data));
    } catch {
      return null;
    }
  },
};
```

`decode` catches JSON parse errors and returns `null` instead of throwing. `validatePresence(null)` then returns `null`, and the message is dropped. `jsonCodec` is the default when `codec` is not passed to `createPresenceClient`.

## MessagePack sketch

MessagePack produces smaller payloads than JSON for the same data. Use any MessagePack library that exposes an `encode`/`decode` pair operating on `Uint8Array`.

```ts
import { encode, decode } from "@msgpack/msgpack";
import type { CursorCodec } from "@anchor-presence/core";

export const messagePackCodec: CursorCodec = {
  encode(message) {
    return encode(message);
  },
  decode(data) {
    try {
      return decode(data);
    } catch {
      return null;
    }
  },
};
```

Wrap every decode call in `try`/`catch`. A malformed or truncated buffer must produce `null`, never an uncaught exception.

## Validation boundary

`decode` output is untrusted, even from a codec that never throws. Core passes every decoded value through `validatePresence()` before it reaches the store:

```ts
const decoded = codec.decode(bytes);          // unknown
const presence = validatePresence(decoded);   // CursorPresence | null
if (presence === null) return;                // dropped
```

`validatePresence` checks every field against the limits in `docs/security.md`: version, ID lengths, sequence type, anchor count, coordinate ranges, and payload size. A message that fails any check is dropped in full; there is no partial acceptance of a malformed message.

This two-step boundary (codec returns `unknown`, `validatePresence` gates) means a codec author never needs to write validation logic. A codec's only job is turning bytes into a value and back, safely.
