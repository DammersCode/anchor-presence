import { createPresenceClient } from "@anchor-presence/core";
import type { AnchorPoint, CursorPosition, PresenceClient } from "@anchor-presence/core";

type TourClient = PresenceClient<TourContext, TourUser>;
import { createBroadcastChannelTransport } from "@anchor-presence/dom";

export type TourUser = { name: string; color: string };

export type TourContext = { selection?: string[]; dialog?: "invite" | null };

export function parseTourContext(value: unknown): TourContext | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const context: TourContext = {};
  if ("selection" in value && Array.isArray(value.selection)) {
    const ids: unknown[] = value.selection;
    if (ids.every((id) => typeof id === "string")) context.selection = ids;
  }
  if ("dialog" in value && (value.dialog === "invite" || value.dialog === null))
    context.dialog = value.dialog;
  return context;
}

export function parseTourUser(value: unknown): TourUser | undefined {
  const name = typeof value === "object" && value !== null && "name" in value ? value.name : undefined;
  const color = typeof value === "object" && value !== null && "color" in value ? value.color : undefined;
  return typeof name === "string" && typeof color === "string" ? { name, color } : undefined;
}

export type TourStep =
  | { kind: "point"; anchor: string; u?: number; v?: number; dwellMs?: number }
  | { kind: "context"; value: TourContext | undefined; dwellMs?: number }
  | { kind: "event"; type: string; data?: unknown; dwellMs?: number }
  | { kind: "quiet"; ms: number }
  | { kind: "leave"; ms: number };

export type TourTrack = {
  user: TourUser;
  delayMs?: number;
  /** `jump` sends one update per stop, so only the receiver's interpolator animates. */
  motion?: "glide" | "jump";
  steps: readonly TourStep[];
};

export type PauseReason = "input" | "offscreen" | "hidden" | "user";

export type TourState = "playing" | "yielded" | "paused" | "waiting";

export type Tour = {
  pause(reason: PauseReason): void;
  resume(reason: PauseReason): void;
  isPaused(reason: PauseReason): boolean;
  state(): TourState;
  dispose(): void;
};

type Point = { x: number; y: number };

const ANCHOR_SELECTOR = "[data-anchor]";
const MAX_ANCHORS = 4;
const GLIDE_MS = 560;
const GLIDE_STEP_MS = 40;
const DEFAULT_DWELL_MS = 1700;
const MISSING_ANCHOR_RETRY_MS = 400;
const MOUSE = { type: "mouse" } as const;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function findAnchor(id: string): Element | null {
  return document.querySelector(`[data-anchor="${CSS.escape(id)}"]`);
}

// Mirrors what the DOM binding sends for a real pointer: the anchor under the point, then its anchored ancestors.
function positionFrom(element: Element | null, point: Point): CursorPosition {
  const anchors: AnchorPoint[] = [];
  let node = element?.closest(ANCHOR_SELECTOR) ?? null;
  while (node !== null && anchors.length < MAX_ANCHORS) {
    const id = node.getAttribute("data-anchor");
    const rect = node.getBoundingClientRect();
    if (id !== null && rect.width > 0 && rect.height > 0) {
      anchors.push({ id, u: (point.x - rect.left) / rect.width, v: (point.y - rect.top) / rect.height });
    }
    node = node.parentElement?.closest(ANCHOR_SELECTOR) ?? null;
  }
  return { anchors, viewport: { u: point.x / window.innerWidth, v: point.y / window.innerHeight } };
}

/** Runs scripted remote users, each a real presence client on the preview channel. */
export function startTour(options: {
  channel: string;
  tracks: readonly TourTrack[];
  reducedMotion: boolean;
  onChange: (state: TourState) => void;
}): Tour {
  const { channel, tracks, reducedMotion, onChange } = options;
  const reasons = new Set<PauseReason>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const clients = new Set<TourClient>();
  let waiters: (() => void)[] = [];
  let disposed = false;

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });
  }

  function gate(): Promise<void> {
    if (reasons.size === 0 || disposed) return Promise.resolve();
    return new Promise((resolve) => waiters.push(resolve));
  }

  function releaseWaiters(): void {
    const ready = waiters;
    waiters = [];
    for (const resolve of ready) resolve();
  }

  function join(user: TourUser): TourClient {
    const transport = createBroadcastChannelTransport(channel);
    // A huge heartbeat keeps a quiet step quiet, so receivers can mark the user idle. The stale timeout stays above twice the heartbeat.
    const client = createPresenceClient({
      transport,
      user,
      clientId: `tour-${user.name}`,
      heartbeatIntervalMs: 3_600_000,
      staleTimeoutMs: 7_200_001,
      parseUser: parseTourUser,
      parseContext: parseTourContext,
    });
    clients.add(client);
    return client;
  }

  function leave(client: TourClient): void {
    clients.delete(client);
    client.dispose();
  }

  async function runTrack(track: TourTrack): Promise<void> {
    const glide = track.motion !== "jump" && !reducedMotion;
    let client: TourClient | null = null;
    let at: Point | null = null;
    await sleep(track.delayMs ?? 0);
    while (!disposed) {
      for (const step of track.steps) {
        await gate();
        if (disposed) return;
        switch (step.kind) {
          case "point": {
            let target = findAnchor(step.anchor);
            while (target === null) {
              await sleep(MISSING_ANCHOR_RETRY_MS);
              await gate();
              if (disposed) return;
              target = findAnchor(step.anchor);
            }
            client ??= join(track.user);
            const rect = target.getBoundingClientRect();
            const end = {
              x: rect.left + rect.width * (step.u ?? 0.5),
              y: rect.top + rect.height * (step.v ?? 0.5),
            };
            if (glide && at !== null) {
              const start = at;
              for (let elapsed = GLIDE_STEP_MS; elapsed < GLIDE_MS; elapsed += GLIDE_STEP_MS) {
                await sleep(GLIDE_STEP_MS);
                await gate();
                if (disposed) return;
                const t = easeInOut(elapsed / GLIDE_MS);
                const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
                client.setLocalCursor(
                  positionFrom(document.elementFromPoint(point.x, point.y), point),
                  MOUSE,
                );
              }
            }
            client.setLocalCursor(positionFrom(target, end), MOUSE);
            at = end;
            await sleep(step.dwellMs ?? DEFAULT_DWELL_MS);
            break;
          }
          case "context": {
            client ??= join(track.user);
            client.setContext(step.value);
            await sleep(step.dwellMs ?? 500);
            break;
          }
          case "event": {
            client ??= join(track.user);
            client.sendEvent(step.type, step.data);
            await sleep(step.dwellMs ?? 500);
            break;
          }
          case "quiet":
            await sleep(step.ms);
            break;
          case "leave":
            if (client !== null) leave(client);
            client = null;
            at = null;
            await sleep(step.ms);
            break;
          default:
            step satisfies never;
        }
      }
    }
  }

  function state(): TourState {
    if (reasons.has("user")) return "paused";
    if (reasons.has("input")) return "yielded";
    if (reasons.size > 0) return "waiting";
    return "playing";
  }

  for (const track of tracks) void runTrack(track);

  return {
    pause(reason) {
      if (reasons.has(reason)) return;
      reasons.add(reason);
      onChange(state());
    },
    resume(reason) {
      if (!reasons.delete(reason)) return;
      if (reasons.size === 0) releaseWaiters();
      onChange(state());
    },
    isPaused(reason) {
      return reasons.has(reason);
    },
    state,
    dispose() {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      releaseWaiters();
      for (const client of clients) client.dispose();
      clients.clear();
    },
  };
}
