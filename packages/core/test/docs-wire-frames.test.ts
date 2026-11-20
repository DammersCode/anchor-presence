import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPresenceClient, jsonCodec, type PresenceTransport } from "@dammers/anchor-presence-core";

const page = readFileSync(
  join(process.cwd(), "apps/docs/content/docs/core/api/protocol.mdx"),
  "utf8",
).replaceAll("\r\n", "\n");

const documentedFrames = [...page.matchAll(/```json\n([\s\S]*?)```/gu)].map(([, body = ""]) =>
  JSON.parse(body),
);

function createCapturingTransport() {
  const frames: unknown[] = [];
  const transport: PresenceTransport = {
    send: (bytes) => {
      frames.push(jsonCodec.decode(bytes));
    },
    subscribe: () => () => {},
    connect: () => {},
    disconnect: () => {},
    getStatus: () => "connected",
    subscribeStatus: (listener) => {
      listener("connected");
      return () => {};
    },
  };
  return { frames, transport };
}

describe("protocol.mdx wire frames", () => {
  it("match the frames that the client sends through jsonCodec", async () => {
    vi.useFakeTimers();
    const { frames, transport } = createCapturingTransport();
    const client = createPresenceClient({
      transport,
      codec: jsonCodec,
      clientId: "client-1",
      idFactory: () => "session-1",
      user: { name: "Ada" },
      publishIntervalMs: 10,
    });
    await vi.advanceTimersByTimeAsync(30);
    frames.length = 0;

    client.setLocalCursor(
      {
        anchors: [
          { id: "board.card-12", u: 0.25, v: 0.5 },
          { id: "board", u: 0.5, v: 0.25 },
        ],
        viewport: { u: 0.4, v: 0.3 },
      },
      { type: "mouse" },
    );
    await vi.advanceTimersByTimeAsync(60);
    client.sendEvent("reaction", { emoji: "party" });
    client.leave();
    client.dispose();
    vi.useRealTimers();

    expect(documentedFrames).toHaveLength(3);
    expect(frames.slice(0, 3)).toEqual(documentedFrames);
  });
});
