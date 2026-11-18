import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { opened, spawnBunRelay } from "./relay-test-helpers";

const directory = mkdtempSync(path.join(tmpdir(), "auth-probe-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe.each(["bun-native", "hono", "elysia"])("auth hook ordering: %s", (example) => {
  it("does not call the auth hook for a plain GET, only for an upgrade", async () => {
    const file = path.join(directory, `${example}.log`);
    const relay = await spawnBunRelay(example, { AUTH_PROBE_FILE: file }, "../_shared/auth-probe-relay.ts");
    const calls = () => (existsSync(file) ? readFileSync(file, "utf8").length : 0);
    try {
      const plain = await fetch(`http://127.0.0.1:${relay.port}/?room=probe&token=t`);
      await plain.arrayBuffer();
      expect(plain.status).not.toBe(101);
      expect(calls()).toBe(0);

      const socket = new WebSocket(`ws://127.0.0.1:${relay.port}/?room=probe&token=t`);
      await opened(socket);
      expect(calls()).toBe(1);
      socket.close();
    } finally {
      await relay.stop();
    }
  }, 20_000);
});
