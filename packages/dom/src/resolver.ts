// Remote anchor resolution — spec §10 — and interpolation integration — spec §13

import type { CursorPresence, InterpolatorFactory } from "@anchor-presence/core";
import { linearInterpolator } from "@anchor-presence/core";
import type { AnchorRegistry } from "./registry";

export type ResolutionTier = "anchor" | "viewport" | "hidden";

export type ResolvedCursor<TContext = unknown, TUser = unknown> = {
  clientId: string;
  x: number; // receiver viewport px
  y: number;
  visible: boolean;
  anchorId: string | null; // which anchor won, null = viewport tier
  tier: ResolutionTier;
  context?: TContext;
  user?: TUser;
};

export type VisibilityPolicy<TContext = unknown> = (input: {
  presence: CursorPresence<TContext>;
  resolution: { tier: ResolutionTier; anchorId: string | null };
}) => "show" | "hide";

export const defaultVisibilityPolicy: VisibilityPolicy = ({ resolution }) =>
  resolution.tier === "hidden" ? "hide" : "show";

export type Rect = { left: number; top: number; width: number; height: number };

export type ViewportSize = { width: number; height: number };

/** An element is measurable when connected and its rect has width > 0 and height > 0 — spec §10. */
export function isMeasurable(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/**
 * Finds the first connected, measurable anchor in the chain (most specific first).
 * Used both by the scheduler (to compute which elements to measure) and by resolvePresence (to compute geometry).
 */
export function findResolvableAnchor(
  presence: CursorPresence,
  registry: AnchorRegistry,
  getRect: (element: Element) => Rect | undefined,
): { id: string; element: Element; rect: Rect } | null {
  const cursor = presence.cursor;
  if (cursor === null) return null;
  for (const anchor of cursor.anchors) {
    const element = registry.get(anchor.id);
    if (element === null) continue;
    const rect = getRect(element);
    if (rect === undefined) continue;
    if (!isMeasurable(rect)) continue;
    return { id: anchor.id, element, rect };
  }
  return null;
}

type RawResolution = {
  x: number;
  y: number;
  tier: ResolutionTier;
  anchorId: string | null;
};

/** Pure geometry resolution (spec §10, steps 1-5) — no interpolation, no visibility policy. */
export function resolveGeometry(
  presence: CursorPresence,
  registry: AnchorRegistry,
  getRect: (element: Element) => Rect | undefined,
  viewportSize: ViewportSize,
): RawResolution {
  const cursor = presence.cursor;
  if (cursor === null) {
    return { x: 0, y: 0, tier: "hidden", anchorId: null };
  }

  const resolved = findResolvableAnchor(presence, registry, getRect);
  if (resolved !== null) {
    const anchor = cursor.anchors.find((a) => a.id === resolved.id);
    const u = anchor?.u ?? 0;
    const v = anchor?.v ?? 0;
    return {
      x: resolved.rect.left + resolved.rect.width * u,
      y: resolved.rect.top + resolved.rect.height * v,
      tier: "anchor",
      anchorId: resolved.id,
    };
  }

  if (cursor.viewport !== undefined) {
    return {
      x: cursor.viewport.u * viewportSize.width,
      y: cursor.viewport.v * viewportSize.height,
      tier: "viewport",
      anchorId: null,
    };
  }

  return { x: 0, y: 0, tier: "hidden", anchorId: null };
}

export type ResolverOptions<TContext = unknown> = {
  registry: AnchorRegistry;
  visibilityPolicy?: VisibilityPolicy<TContext>;
  interpolatorFactory?: InterpolatorFactory;
};

type InterpolatorState = {
  interpolator: ReturnType<InterpolatorFactory>;
  lastRawX: number;
  lastRawY: number;
  lastTier: ResolutionTier;
  lastAnchorId: string | null;
};

/**
 * Stateful resolver: tracks one interpolator per clientId, decides target() vs shift() per spec §13.
 * `networkUpdated` clientIds got new presence data since the last pass (call target());
 * everyone else moved only because of a local invalidation (call shift() with the delta).
 */
export class RemoteResolver<TContext = unknown, TUser = unknown> {
  private readonly registry: AnchorRegistry;
  private readonly visibilityPolicy: VisibilityPolicy<TContext>;
  private readonly interpolatorFactory: InterpolatorFactory;
  private readonly states = new Map<string, InterpolatorState>();

  constructor(options: ResolverOptions<TContext>) {
    this.registry = options.registry;
    this.visibilityPolicy = options.visibilityPolicy ?? (defaultVisibilityPolicy as VisibilityPolicy<TContext>);
    this.interpolatorFactory = options.interpolatorFactory ?? linearInterpolator;
  }

  /** Removes interpolator state for clientIds no longer present (call after each store snapshot changes). */
  prune(activeClientIds: ReadonlySet<string>): void {
    for (const clientId of this.states.keys()) {
      if (!activeClientIds.has(clientId)) this.states.delete(clientId);
    }
  }

  resolveAll(
    presences: readonly CursorPresence<TContext, TUser>[],
    getRect: (element: Element) => Rect | undefined,
    viewportSize: ViewportSize,
    networkUpdated: ReadonlySet<string>,
    timestampMs: number,
  ): { cursors: ResolvedCursor<TContext, TUser>[]; unsettled: boolean } {
    const activeIds = new Set(presences.map((p) => p.clientId));
    this.prune(activeIds);

    const results: ResolvedCursor<TContext, TUser>[] = [];
    let unsettled = false;
    for (const presence of presences) {
      const raw = resolveGeometry(presence, this.registry, getRect, viewportSize);
      const visibility = this.visibilityPolicy({
        presence,
        resolution: { tier: raw.tier, anchorId: raw.anchorId },
      });

      let state = this.states.get(presence.clientId);
      if (state === undefined) {
        state = {
          interpolator: this.interpolatorFactory(),
          lastRawX: raw.x,
          lastRawY: raw.y,
          lastTier: raw.tier,
          lastAnchorId: raw.anchorId,
        };
        state.interpolator.target(raw.x, raw.y, timestampMs);
        this.states.set(presence.clientId, state);
      } else if (networkUpdated.has(presence.clientId)) {
        state.interpolator.target(raw.x, raw.y, timestampMs);
      } else if (raw.x !== state.lastRawX || raw.y !== state.lastRawY) {
        // local-only invalidation moved the resolved position: shift current+target by the delta, no easing
        state.interpolator.shift(raw.x - state.lastRawX, raw.y - state.lastRawY);
      }
      state.lastRawX = raw.x;
      state.lastRawY = raw.y;
      state.lastTier = raw.tier;
      state.lastAnchorId = raw.anchorId;

      const sample = state.interpolator.sample(timestampMs);
      if (!sample.settled) unsettled = true;
      const result: ResolvedCursor<TContext, TUser> = {
        clientId: presence.clientId,
        x: sample.x,
        y: sample.y,
        visible: visibility === "show",
        anchorId: raw.anchorId,
        tier: raw.tier,
      };
      if (presence.context !== undefined) result.context = presence.context;
      if (presence.user !== undefined) result.user = presence.user;
      results.push(result);
    }
    return { cursors: results, unsettled };
  }
}
