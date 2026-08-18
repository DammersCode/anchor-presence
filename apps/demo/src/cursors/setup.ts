// Browser-only client creation — never imported by SSR/module-eval code paths.
import { createPresenceClient } from "@anchor-presence/core";
import type { PresenceClient } from "@anchor-presence/core";
import { createWebSocketTransport } from "./transport";
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

export function isKnownCursorColor(color: unknown): color is (typeof CURSOR_PALETTE)[number] {
  return typeof color === "string" && (CURSOR_PALETTE as readonly string[]).includes(color);
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

let client: PresenceClient<DemoContext, DemoUser> | null = null;

/** Module-safe: constructs the transport/client lazily so importing this module never touches the network at eval time. */
export function getPresenceClient(): PresenceClient<DemoContext, DemoUser> {
  if (client !== null) return client;
  const transport = createWebSocketTransport({ room: localRoom });
  client = createPresenceClient<DemoContext, DemoUser>({
    transport,
    user: { name: localUserName, color: colorForName(localUserName) },
  });
  transport.connect?.();
  return client;
}
