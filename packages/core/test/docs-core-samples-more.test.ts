import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  binaryCodec,
  jsonCodec,
  linearInterpolator,
  type ConnectionStatus,
  type CursorCodec as ExportedCursorCodec,
  type CursorPresence,
  type Interpolator as ExportedInterpolator,
  type InterpolatorFactory as ExportedInterpolatorFactory,
  type LiveCursorTransport,
} from "@anchor-presence/core";

// Verbatim copies of doc samples; the last test checks each copy against its .mdx source.

function createBroadcastChannelTransport(channelName: string): LiveCursorTransport {
  const listeners = new Set<(data: Uint8Array) => void>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let channel: BroadcastChannel | null = null;
  let status: ConnectionStatus = "disconnected";

  function setStatus(next: ConnectionStatus) {
    status = next;
    for (const listener of statusListeners) listener(next);
  }

  return {
    connect() {
      if (channel !== null) return;
      channel = new BroadcastChannel(channelName);
      channel.addEventListener("message", (event: MessageEvent<Uint8Array>) => {
        for (const listener of listeners) listener(event.data);
      });
      // a BroadcastChannel has no handshake, so it is connected at once
      setStatus("connected");
    },
    disconnect() {
      channel?.close();
      channel = null;
      setStatus("disconnected");
    },
    send(data) {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel takes no origin
      channel?.postMessage(data);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeStatus(listener) {
      listener(status);
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    getStatus() {
      return status;
    },
  };
}

interface Interpolator {
  target(x: number, y: number, timestampMs: number): void;
  shift(dx: number, dy: number): void;
  sample(timestampMs: number): { x: number; y: number; settled: boolean };
  sampleInto?(out: { x: number; y: number; settled: boolean }, timestampMs: number): void;
  reset?(): void;
}

type InterpolatorFactory = () => Interpolator;

interface CursorCodec {
  encode(message: CursorPresence): Uint8Array;
  decode(data: Uint8Array): unknown;
}

const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

// Returns the ts block of `page` that contains `marker`, without import lines.
function docSample(page: string, marker: string): string {
  const markdown = readRepoFile(`apps/docs/content/docs/${page}`);
  const blocks = [...markdown.matchAll(/```tsx?\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
    body
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n")
      .trim(),
  );
  const block = blocks.find((body) => body.includes(marker));
  if (block === undefined) throw new Error(`no sample with "${marker}" in ${page}`);
  return block;
}

const presence: CursorPresence = {
  version: 1,
  clientId: "a",
  session: "s",
  sequence: 1,
  cursor: { anchors: [{ id: "nav", u: 0.5, v: 0.5 }] },
};

describe("custom-transport.mdx: BroadcastChannel sketch", () => {
  it("carries bytes between two transports on one channel", async () => {
    const sender = createBroadcastChannelTransport("docs-more");
    const receiver = createBroadcastChannelTransport("docs-more");
    expect(sender.getStatus?.()).toBe("disconnected");
    await sender.connect?.();
    await receiver.connect?.();
    const received = new Promise<Uint8Array>((resolve) => {
      receiver.subscribe(resolve);
    });

    await sender.send(new Uint8Array([1, 2, 3]));

    expect(Array.from(await received)).toEqual([1, 2, 3]);
    expect(sender.getStatus?.()).toBe("connected");
    await sender.disconnect?.();
    await receiver.disconnect?.();
    expect(sender.getStatus?.()).toBe("disconnected");
  });
});

describe("interpolation.mdx: Interpolator listing", () => {
  it("equals the exported types, and linearInterpolator fits it", () => {
    expectTypeOf<Interpolator>().toEqualTypeOf<ExportedInterpolator>();
    expectTypeOf<InterpolatorFactory>().toEqualTypeOf<ExportedInterpolatorFactory>();
    const interpolator: Interpolator = linearInterpolator(80);
    interpolator.target(10, 20, 0);
    expect(interpolator.sample(0)).toEqual({ x: 10, y: 20, settled: true });
  });
});

describe("codecs.mdx: CursorCodec listing", () => {
  it("equals the exported type, and both codecs round-trip through it", () => {
    expectTypeOf<CursorCodec>().toEqualTypeOf<ExportedCursorCodec>();
    const codecs: CursorCodec[] = [jsonCodec, binaryCodec];
    for (const codec of codecs) expect(codec.decode(codec.encode(presence))).toMatchObject(presence);
  });
});

describe("codecs.mdx and performance.mdx: wire sizes", () => {
  it("a 4-anchor message with a small user is 292 JSON bytes and 144 binary bytes", () => {
    const message: CursorPresence = {
      version: 1,
      clientId: "bench-client",
      session: "bench-client-s",
      sequence: 1,
      cursor: {
        anchors: [
          { id: "a1", u: 0.1, v: 0.2 },
          { id: "a2", u: 0.3, v: 0.4 },
          { id: "a3", u: 0.5, v: 0.6 },
          { id: "a4", u: 0.7, v: 0.8 },
        ],
        viewport: { u: 0.5, v: 0.5 },
      },
      user: { name: "bench-client", color: "#6366f1" },
    };
    expect(jsonCodec.encode(message).byteLength).toBe(292);
    expect(binaryCodec.encode(message).byteLength).toBe(144);
  });
});

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    const source = readRepoFile("packages/core/test/docs-core-samples-more.test.ts")
      .split("\n")
      .filter((line) => !line.includes("oxlint-disable"))
      .join("\n");
    const samples = [
      docSample("core/custom-transport.mdx", "function createBroadcastChannelTransport"),
      docSample("core/interpolation.mdx", "interface Interpolator"),
      docSample("core/codecs.mdx", "interface CursorCodec"),
    ];
    for (const sample of samples) expect(source).toContain(sample);
  });
});
