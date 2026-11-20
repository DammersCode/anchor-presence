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
  switch (data.kind) {
    case "hello":
    case "input":
    case "toggle":
      return { kind: data.kind };
    case "visible":
      return "visible" in data && typeof data.visible === "boolean"
        ? { kind: "visible", visible: data.visible }
        : null;
    case "tour":
      return "state" in data && isTourState(data.state) ? { kind: "tour", state: data.state } : null;
    default:
      return null;
  }
}

const TOUR_STATES: readonly unknown[] = ["playing", "yielded", "paused", "waiting"] satisfies TourState[];

function isTourState(value: unknown): value is TourState {
  return TOUR_STATES.includes(value);
}
