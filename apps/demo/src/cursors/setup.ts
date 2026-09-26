// Browser-only client creation — never imported by SSR/module-eval code paths.
import { createPresenceClient } from "@anchor-presence/core";
import type { PresenceClient } from "@anchor-presence/core";
import { randomName, randomRoom } from "../lib/names";
import { createBackendTransport, resolveBackendId } from "./backends";
import { colorForName } from "./palette";

export type PageId = "dashboard" | "orders" | "customers" | "products";
export type DemoContext = { page?: PageId; dialog?: "settings" };
export type DemoUser = { name: string; color: string };

export { CURSOR_PALETTE, DEFAULT_CURSOR_COLOR, isKnownCursorColor, colorForName } from "./palette";

const params = new URLSearchParams(window.location.search);
export const localUserName = params.get("name") || randomName();
export const localRoom = params.get("room") || randomRoom();
export const backendId = resolveBackendId(window.location.search);

let client: PresenceClient<DemoContext, DemoUser> | null = null;

/** Module-safe: constructs the transport/client lazily so importing this module never touches the network at eval time. */
export function getPresenceClient(): PresenceClient<DemoContext, DemoUser> {
  if (client !== null) return client;
  const { transport, codec } = createBackendTransport(backendId, localRoom);
  client = createPresenceClient<DemoContext, DemoUser>({
    transport,
    codec,
    user: { name: localUserName, color: colorForName(localUserName) },
  });
  transport.connect?.();
  return client;
}
