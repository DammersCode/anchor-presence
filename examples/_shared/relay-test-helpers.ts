import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("expected a numeric port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

function waitForPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryConnect = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        attempts += 1;
        if (attempts >= 50) reject(new Error(`port ${port} did not open`));
        else setTimeout(tryConnect, 100);
      });
    };
    tryConnect();
  });
}

export type SpawnedRelay = { port: number; stop: () => Promise<void> };

/** Runs `examples/<example>/relay.ts` as a Bun child process, because vitest's worker runs under Node. */
export async function spawnBunRelay(
  example: string,
  env: Record<string, string> = {},
): Promise<SpawnedRelay> {
  const port = await freePort();
  const child = spawn("bun", ["run", "--cwd", `examples/${example}`, "relay.ts", String(port)], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitForPort(port);
  return {
    port,
    stop: async () => {
      child.kill();
      await new Promise((resolve) => setTimeout(resolve, 50));
    },
  };
}

export type UnresponsivePeer = { upgraded: Promise<void>; closed: Promise<void>; destroy: () => void };

/** Completes a WebSocket handshake over raw TCP and then never answers a ping, like a peer whose network died. */
export function openUnresponsivePeer(port: number, room: string): UnresponsivePeer {
  const socket = net.connect(port, "127.0.0.1", () => {
    socket.write(
      [
        `GET /?room=${encodeURIComponent(room)} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"),
    );
  });
  const upgraded = new Promise<void>((resolve, reject) => {
    socket.once("data", (chunk: Buffer) => {
      if (chunk.toString("latin1").startsWith("HTTP/1.1 101")) resolve();
      else reject(new Error("upgrade refused"));
    });
  });
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  socket.on("error", () => {});
  return { upgraded, closed, destroy: () => socket.destroy() };
}

/** Resolves with the close code, or 1006 when the server drops the socket before the handshake. */
export function closeCode(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("close", (event) => resolve(event.code));
    // Bun emits error without close when a handshake is aborted; settle on either so tests fail fast.
    socket.addEventListener("error", () => reject(new Error("socket error before close")));
  });
}

export function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    // Bun emits error without close when a handshake is aborted; settle on either so tests fail fast.
    socket.addEventListener("error", () => reject(new Error("closed before open")));
    socket.addEventListener("close", () => reject(new Error("closed before open")));
  });
}
