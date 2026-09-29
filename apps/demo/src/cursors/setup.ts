// Browser-only values — never imported by SSR/module-eval code paths.
import { randomName, randomRoom } from "../lib/names";
import { resolveBackendId } from "./backends";

export type PageId = "dashboard" | "orders" | "customers" | "products";
export type DemoContext = { page?: PageId; dialog?: "settings" };
export type DemoUser = { name: string; color: string };

export { CURSOR_PALETTE, DEFAULT_CURSOR_COLOR, isKnownCursorColor, colorForName } from "./palette";

const params = new URLSearchParams(window.location.search);
export const localUserName = params.get("name") || randomName();
export const localRoom = params.get("room") || randomRoom();
export const backendId = resolveBackendId(window.location.search);
