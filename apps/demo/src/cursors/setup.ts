// Browser-only values — never imported by SSR/module-eval code paths.
import { randomName, randomRoom } from "../lib/names";
import { resolveBackendId } from "./backends";

export type PageId = "dashboard" | "orders" | "customers" | "products";
export type DemoContext = { page?: PageId; dialog?: "settings" };
export type DemoUser = { name: string; color: string };

export const DEMO_REACTIONS = [
  { name: "thumbs-up", symbol: "👍" },
  { name: "party", symbol: "🎉" },
  { name: "heart", symbol: "❤️" },
] as const;
export const MAX_CHAT_LENGTH = 80;

export type DemoEvent = { type: "reaction"; emoji: string } | { type: "chat"; text: string };

/** Accepts only the two events the demo sends, with an allowed emoji or a capped text. */
export function parseDemoEvent(event: { type: string; data?: unknown }): DemoEvent | undefined {
  const data = event.data as { emoji?: unknown; text?: unknown } | undefined;
  if (event.type === "reaction" && DEMO_REACTIONS.some((reaction) => reaction.symbol === data?.emoji)) {
    return { type: "reaction", emoji: String(data?.emoji) };
  }
  if (event.type === "chat" && typeof data?.text === "string" && data.text.length <= MAX_CHAT_LENGTH) {
    return { type: "chat", text: data.text };
  }
  return undefined;
}

export function parseDemoUser(value: unknown): DemoUser | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { name, color } = value as Record<string, unknown>;
  if (typeof name !== "string" || typeof color !== "string") return undefined;
  return { name: name.slice(0, 40), color };
}

export { CURSOR_PALETTE, DEFAULT_CURSOR_COLOR, isKnownCursorColor, colorForName } from "./palette";

const params = new URLSearchParams(window.location.search);
export const localUserName = params.get("name") || randomName();
export const localRoom = params.get("room") || randomRoom();
export const backendId = resolveBackendId(window.location.search);
