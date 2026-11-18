import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createEventChannel,
  createEventParser,
  createInMemoryPair,
  createPresenceClient,
  type CursorCodec,
  type CursorPresence,
  type EventChannel as ExportedEventChannel,
  type EventMap as ExportedEventMap,
  type EventParsers as ExportedEventParsers,
  type PresenceClient,
  type RemoteEvent,
  type TypedRemoteEvent as ExportedTypedRemoteEvent,
} from "@anchor-presence/core";

// Verbatim copies of doc samples; the last test checks each copy against its .mdx source.

// stand-ins for @msgpack/msgpack, which the repo does not install
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (data: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(data));

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

declare namespace Listing {
  type EventMap = Record<string, unknown>;

  type TypedRemoteEvent<TEvents extends object> = {
    [K in keyof TEvents & string]: { clientId: string; type: K; data: TEvents[K] };
  }[keyof TEvents & string];

  type EventChannel<TEvents extends object> = {
    send<K extends keyof TEvents & string>(
      type: K,
      ...data: undefined extends TEvents[K] ? [data?: TEvents[K]] : [data: TEvents[K]]
    ): boolean;
    subscribe(listener: (event: TypedRemoteEvent<TEvents>) => void): () => void;
  };

  // oxlint-disable-next-line eslint/no-shadow -- the listing keeps the exported name
  function createEventChannel<TEvents extends object>(
    client: Pick<PresenceClient, "sendEvent" | "subscribeEvents">,
  ): EventChannel<TEvents>;

  type EventParsers<TEvents extends object> = {
    [K in keyof TEvents & string]:
      ((data: unknown) => TEvents[K] | undefined) | (undefined extends TEvents[K] ? null : never);
  };

  // oxlint-disable-next-line eslint/no-shadow -- the listing keeps the exported name
  function createEventParser<TEvents extends object>(
    parsers: EventParsers<TEvents>,
  ): (event: RemoteEvent) => TypedRemoteEvent<TEvents> | undefined;
}

type ListingEvents = { reaction: { emoji: string }; ping: undefined };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("events.mdx: event rate limit", () => {
  it("drops the events of one sender above the burst", () => {
    const { a, b } = createInMemoryPair();
    const myTransport = b;
    const client = createPresenceClient({
      transport: myTransport,
      eventRateLimit: { burst: 40, perSecond: 20, totalPerSecond: 200 },
    });
    const sender = createPresenceClient({ transport: a });
    let received = 0;
    client.subscribeEvents(() => (received += 1));

    for (let index = 0; index < 50; index += 1) expect(sender.sendEvent("spam")).toBe(true);
    expect(received).toBe(40);

    vi.advanceTimersByTime(500);
    for (let index = 0; index < 50; index += 1) sender.sendEvent("spam");
    expect(received).toBe(50);
    sender.dispose();
    client.dispose();
  });
});

describe("presence-client.mdx: create a client", () => {
  it("runs from creation to dispose and leaves no peer behind", () => {
    const { a, b } = createInMemoryPair();
    const myTransport = a;
    const peer = createPresenceClient({ transport: b });

    const client = createPresenceClient({ transport: myTransport, user: { name: "Ada" } });

    client.setLocalCursor({ anchors: [{ id: "doc", u: 0.5, v: 0.5 }] });
    const unsubscribe = client.subscribeRemote(() => console.log(client.getRemotePresence()));

    client.dispose();

    expectTypeOf(unsubscribe).toEqualTypeOf<() => void>();
    vi.advanceTimersByTime(100);
    expect(peer.getRemotePresence()).toEqual([]);
    peer.dispose();
  });
});

describe("events.mdx: typed events", () => {
  it("sends typed events, and the parser drops data that does not fit the map", () => {
    const { a, b } = createInMemoryPair();
    const myTransport = a;
    const showReaction = vi.fn<(clientId: string, emoji: string) => void>();
    const peer = createPresenceClient({ transport: b, clientId: "B" });
    const peerEvents: RemoteEvent[] = [];
    peer.subscribeEvents((event) => peerEvents.push(event));

    type Events = { reaction: { emoji: string }; ping: undefined };

    const parseEvent = createEventParser<Events>({
      reaction: (data) => {
        const emoji = (data as { emoji?: unknown } | undefined)?.emoji;
        return typeof emoji === "string" ? { emoji } : undefined;
      },
      ping: null,
    });

    const client = createPresenceClient({ transport: myTransport, parseEvent });
    const events = createEventChannel<Events>(client);

    events.send("reaction", { emoji: "tada" });
    events.send("ping");
    const unsubscribe = events.subscribe((event) => {
      if (event.type === "reaction") showReaction(event.clientId, event.data.emoji);
    });

    expect(peerEvents.map((event) => [event.type, event.data])).toEqual([
      ["reaction", { emoji: "tada" }],
      ["ping", undefined],
    ]);

    const seen: string[] = [];
    client.subscribeEvents((event) => seen.push(event.type));
    peer.sendEvent("reaction", { emoji: "wave" });
    peer.sendEvent("reaction", { emoji: 3 });
    peer.sendEvent("ping");
    peer.sendEvent("other");
    expect(showReaction.mock.calls).toEqual([["B", "wave"]]);
    expect(seen).toEqual(["reaction", "ping"]);

    unsubscribe();
    peer.sendEvent("reaction", { emoji: "again" });
    expect(showReaction).toHaveBeenCalledTimes(1);
    peer.dispose();
    client.dispose();
  });
});

describe("api/client.mdx: createEventChannel listing", () => {
  it("equals the exported types and signature", () => {
    expectTypeOf<Listing.EventMap>().toEqualTypeOf<ExportedEventMap>();
    expectTypeOf<Listing.TypedRemoteEvent<ListingEvents>>().toEqualTypeOf<
      ExportedTypedRemoteEvent<ListingEvents>
    >();
    expectTypeOf<Listing.EventChannel<ListingEvents>>().toEqualTypeOf<ExportedEventChannel<ListingEvents>>();
    expectTypeOf<typeof Listing.createEventChannel<ListingEvents>>().toEqualTypeOf<
      typeof createEventChannel<ListingEvents>
    >();
    expect(createEventChannel).toBeTypeOf("function");
  });

  it("lists the exported createEventParser and EventParsers", () => {
    expectTypeOf<Listing.EventParsers<ListingEvents>>().toEqualTypeOf<ExportedEventParsers<ListingEvents>>();
    expectTypeOf<typeof Listing.createEventParser<ListingEvents>>().toEqualTypeOf<
      typeof createEventParser<ListingEvents>
    >();
  });
});

describe("custom-codec.mdx: MessagePack sketch", () => {
  it("round-trips a message and returns null for a malformed buffer", () => {
    const message: CursorPresence = { version: 1, clientId: "a", session: "s", sequence: 1, cursor: null };
    expect(messagePackCodec.decode(messagePackCodec.encode(message))).toEqual(message);
    expect(messagePackCodec.decode(new Uint8Array([0x7b, 0x22]))).toBeNull();
  });
});

const readRepoFile = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8").replaceAll("\r\n", "\n");

// Leading whitespace differs between a sample and its copy inside a block, so compare trimmed lines.
const trimLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

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

describe("doc sample sources", () => {
  it("match the copies in this file", () => {
    const source = trimLines(readRepoFile("packages/core/test/docs-core-samples-events.test.ts"))
      .split("\n")
      .filter((line) => !line.includes("oxlint-disable"))
      .join("\n");
    const samples = [
      docSample("core/events.mdx", "eventRateLimit: { burst: 40"),
      docSample("core/presence-client.mdx", 'user: { name: "Ada" } });'),
      docSample("core/events.mdx", "createEventParser<Events>"),
      docSample("core/api/client.mdx", "type EventMap"),
      docSample("core/api/client.mdx", "type EventParsers"),
      docSample("core/custom-codec.mdx", "messagePackCodec"),
    ];
    for (const sample of samples) expect(source).toContain(trimLines(sample));
  });
});
