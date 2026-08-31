// Browser-only client creation — never imported by SSR/module-eval code paths.
// Identical to apps/demo's setup except the transport: Socket.IO instead of plain
// WebSocket, so the rest of the copied demo UI is untouched.
import { createPresenceClient } from "@anchor-presence/core";
import type { PresenceClient } from "@anchor-presence/core";
import { io } from "socket.io-client";
import { createSocketIoTransport } from "../../../transport";
import { randomName } from "../lib/names";

export type PageId = "dashboard" | "orders" | "customers" | "products";
export type DemoContext = { page?: PageId; dialog?: "settings" };
export type DemoUser = { name: string; color: string };

// Fixed palette so the receiver can validate a remote color instead of trusting arbitrary CSS from the wire.
export const CURSOR_PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
] as const;

export const DEFAULT_CURSOR_COLOR = "#6b7280"; // gray-500 fallback for unrecognized colors

export function isKnownCursorColor(
  color: unknown,
): color is (typeof CURSOR_PALETTE)[number] {
  return (
    typeof color === "string" &&
    (CURSOR_PALETTE as readonly string[]).includes(color)
  );
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function colorForName(name: string): string {
  return CURSOR_PALETTE[hashString(name) % CURSOR_PALETTE.length]!;
}

const params = new URLSearchParams(window.location.search);
export const localUserName = params.get("name") || randomName();
export const localRoom = params.get("room") || "main";

// Shortened timeouts for a quick stale-cursor check: ?stale-ms=4000&heartbeat-ms=1000
const staleMs = Number(params.get("stale-ms") ?? 70_000);
const heartbeatMs = Number(params.get("heartbeat-ms") ?? 10_000);

// Example relay port: the socketio example server listens on 5001 (demo uses 8787).
const relayUrl = params.get("server") ?? "http://localhost:5001";

let client: PresenceClient<DemoContext, DemoUser> | null = null;

/** Module-safe: constructs the transport/client lazily so importing this module never touches the network at eval time. */
export function getPresenceClient(): PresenceClient<DemoContext, DemoUser> {
  if (client !== null) return client;
  const socket = io(relayUrl, {
    query: { room: localRoom },
    transports: ["websocket"],
  });
  const transport = createSocketIoTransport(socket);
  client = createPresenceClient<DemoContext, DemoUser>({
    transport,
    user: { name: localUserName, color: colorForName(localUserName) },
    staleTimeoutMs: staleMs,
    heartbeatMs,
  });
  transport.connect?.();
  return client;
}
