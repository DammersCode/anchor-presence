// Browser-only values — never imported by SSR/module-eval code paths.
import { randomName, randomRoom } from "../lib/names";
import { resolveBackendId } from "./backends";
import { createEventParser } from "@anchor-presence/core";

export type PageId = "dashboard" | "orders" | "customers" | "products";
export type DemoContext = { page?: PageId; dialog?: "settings" };
export type DemoUser = { name: string; color: string };

export const DEMO_REACTIONS = [
  { name: "thumbs-up", symbol: "👍" },
  { name: "party", symbol: "🎉" },
  { name: "heart", symbol: "❤️" },
] as const;
export const MAX_CHAT_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The events the demo sends, by type. */
export type DemoEvents = { reaction: { emoji: string }; chat: { text: string } };

export type DemoEvent = { type: "reaction"; emoji: string } | { type: "chat"; text: string };

/** Accepts only the two events the demo sends, with an allowed emoji or a capped text. */
export function parseDemoEvent(event: { type: string; data?: unknown }): DemoEvent | undefined {
  if (!isRecord(event.data)) return undefined;
  const { emoji, text } = event.data;
  if (
    event.type === "reaction" &&
    typeof emoji === "string" &&
    DEMO_REACTIONS.some((r) => r.symbol === emoji)
  ) {
    return { type: "reaction", emoji };
  }
  if (event.type === "chat" && typeof text === "string" && text.length <= MAX_CHAT_LENGTH) {
    return { type: "chat", text };
  }
  return undefined;
}

export const parseDemoEvents = createEventParser<DemoEvents>({
  reaction: (data) => {
    const parsed = parseDemoEvent({ type: "reaction", data });
    return parsed?.type === "reaction" ? { emoji: parsed.emoji } : undefined;
  },
  chat: (data) => {
    const parsed = parseDemoEvent({ type: "chat", data });
    return parsed?.type === "chat" ? { text: parsed.text } : undefined;
  },
});

export function parseDemoUser(value: unknown): DemoUser | undefined {
  if (!isRecord(value)) return undefined;
  const { name, color } = value;
  if (typeof name !== "string" || typeof color !== "string") return undefined;
  return { name: name.slice(0, 40), color };
}

const PAGE_IDS: readonly PageId[] = ["dashboard", "orders", "customers", "products"];

function isPageId(value: unknown): value is PageId {
  return PAGE_IDS.some((id) => id === value);
}

export function parseDemoContext(value: unknown): DemoContext | undefined {
  if (!isRecord(value)) return undefined;
  const { page, dialog } = value;
  const parsed: DemoContext = {};
  if (isPageId(page)) parsed.page = page;
  if (dialog === "settings") parsed.dialog = dialog;
  return parsed;
}

export { CURSOR_PALETTE, DEFAULT_CURSOR_COLOR, isKnownCursorColor, colorForName } from "./palette";

const params = new URLSearchParams(window.location.search);
export const localUserName = params.get("name") || randomName();
export const localRoom = params.get("room") || randomRoom();
export const backendId = resolveBackendId(window.location.search);
