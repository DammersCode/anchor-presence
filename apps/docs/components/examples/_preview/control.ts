import type { TourState } from "./tour";

/** Messages between the preview page and its pane iframes, on a channel next to the presence channel. */
export type ControlMessage =
  | { kind: "hello" }
  | { kind: "input" }
  | { kind: "visible"; visible: boolean }
  | { kind: "toggle" }
  | { kind: "tour"; state: TourState };

export const RESUME_AFTER_MS = 4000;

export function openControlChannel(channel: string): BroadcastChannel {
  return new BroadcastChannel(`${channel}:control`);
}

export function readControlMessage(event: MessageEvent<unknown>): ControlMessage | null {
  const data = event.data;
  if (typeof data !== "object" || data === null || !("kind" in data)) return null;
  return data as ControlMessage;
}
