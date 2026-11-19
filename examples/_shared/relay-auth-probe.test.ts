import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { closeCode, opened, spawnBunRelay } from "./relay-test-helpers";

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

describe.each([
  ["bun-native", "bun-native", "../_shared/auth-probe-relay.ts"],
  ["hono", "hono", "../_shared/auth-probe-relay.ts"],
  ["elysia", "elysia", "../_shared/auth-probe-relay.ts"],
  ["reference", "../apps/server", "../../examples/_shared/auth-probe-relay.ts"],
])("origin before auth hook: %s", (name, example, entry) => {
  it("closes a foreign origin with 4004 without calling the auth hook", async () => {
    const file = path.join(directory, `${name}-origin.log`);
    const env = { AUTH_PROBE_FILE: file, RELAY_ALLOWED_ORIGINS: "https://good.example" };
    const relay = await spawnBunRelay(example, env, entry);
    const calls = () => (existsSync(file) ? readFileSync(file, "utf8").length : 0);
    try {
      const url = `ws://127.0.0.1:${relay.port}/?room=probe&token=t`;
      const withOrigin = (origin: string) => new WebSocket(url, { headers: { Origin: origin } } as never);
      expect(await closeCode(withOrigin("https://evil.example"))).toBe(4004);
      expect(calls()).toBe(0);
      const admitted = withOrigin("https://good.example");
      await opened(admitted);
      expect(calls()).toBe(1);
      admitted.close();
    } finally {
      await relay.stop();
    }
  }, 20_000);
});
