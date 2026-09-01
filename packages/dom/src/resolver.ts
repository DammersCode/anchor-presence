// Remote anchor resolution — spec §10 — and interpolation integration — spec §13

import type { CursorPresence, InterpolatorFactory } from "@anchor-presence/core";
import { linearInterpolator } from "@anchor-presence/core";
import type { AnchorRegistry } from "./registry";
import type { Rect, ViewportSize } from "./geometry";
import { computeVisibleRect, isPointInRect } from "./occlusion";
import type { SchedulerReadState } from "./scheduler";

export type ResolutionTier = "anchor" | "viewport" | "hidden";

export type ResolvedCursor<TContext = unknown, TUser = unknown> = {
  clientId: string;
  x: number; // receiver viewport px
  y: number;
  visible: boolean;
  pointVisible: boolean;
  anchorId: string | null; // which anchor won, null = viewport tier
  tier: ResolutionTier;
  context?: TContext;
  user?: TUser;
};

export type VisibilityPolicy<TContext = unknown> = (input: {
  presence: CursorPresence<TContext>;
  resolution: { tier: ResolutionTier; anchorId: string | null; pointVisible: boolean };
}) => "show" | "hide";

export const defaultVisibilityPolicy: VisibilityPolicy = ({ resolution }) =>
  resolution.tier === "hidden" ? "hide" : "show";

/** An element is measurable when connected and its rect has width > 0 and height > 0 — spec §10. */
export function isMeasurable(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** Finds the first connected, measurable anchor in the chain (most specific first). */
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
  pointVisible: boolean;
  element: Element | null;
  activeAnchors: Element[];
};

type VisibleRectEntry = { rect: Rect | null; clippingAncestors: Element[] };

/** Pure geometry resolution (spec §10, steps 1-5) — no interpolation, no visibility policy. */
export function resolveGeometry(
  presence: CursorPresence,
  registry: AnchorRegistry,
  readState: SchedulerReadState,
  visibleRectMemo?: Map<Element, VisibleRectEntry>,
): RawResolution {
  const cursor = presence.cursor;
  if (cursor === null) {
    return { x: 0, y: 0, tier: "hidden", anchorId: null, pointVisible: false, element: null, activeAnchors: [] };
  }

  const resolved = findResolvableAnchor(presence, registry, readState.getRect);
  if (resolved !== null) {
    const anchor = cursor.anchors.find((a) => a.id === resolved.id);
    const u = anchor?.u ?? 0;
    const v = anchor?.v ?? 0;
    const x = resolved.rect.left + resolved.rect.width * u;
    const y = resolved.rect.top + resolved.rect.height * v;
    let entry = visibleRectMemo?.get(resolved.element);
    if (entry === undefined) {
      const clippingAncestors: Element[] = [];
      const rect = computeVisibleRect(resolved.element, resolved.rect, readState, (ancestor) =>
        clippingAncestors.push(ancestor),
      );
      entry = { rect, clippingAncestors };
      visibleRectMemo?.set(resolved.element, entry);
    }
    return {
      x,
      y,
      tier: "anchor",
      anchorId: resolved.id,
      pointVisible: isPointInRect(x, y, entry.rect),
      element: resolved.element,
      activeAnchors: [resolved.element, ...entry.clippingAncestors],
    };
  }

  if (cursor.viewport !== undefined) {
    return {
      x: cursor.viewport.u * readState.viewportSize.width,
      y: cursor.viewport.v * readState.viewportSize.height,
      tier: "viewport",
      anchorId: null,
      pointVisible: true,
      element: null,
      activeAnchors: [],
    };
  }

  return { x: 0, y: 0, tier: "hidden", anchorId: null, pointVisible: false, element: null, activeAnchors: [] };
}

export type ResolverOptions<TContext = unknown> = {
  registry: AnchorRegistry;
  visibilityPolicy?: VisibilityPolicy<TContext> | undefined;
  interpolatorFactory?: InterpolatorFactory | undefined;
  hitTest?: boolean | undefined;
};

type InterpolatorState = {
  interpolator: ReturnType<InterpolatorFactory>;
  lastRawX: number;
  lastRawY: number;
  lastPresence: unknown;
};

/** Stateful resolver: tracks one interpolator per clientId, decides target() vs shift() per spec §13. */
export class RemoteResolver<TContext = unknown, TUser = unknown> {
  private readonly registry: AnchorRegistry;
  private readonly visibilityPolicy: VisibilityPolicy<TContext>;
  private readonly interpolatorFactory: InterpolatorFactory;
  private readonly hitTest: boolean;
  private readonly states = new Map<string, InterpolatorState>();
  // spec §14.1: unchanged cursors (and an unchanged list) keep their identity across passes
  private readonly lastResults = new Map<string, ResolvedCursor<TContext, TUser>>();
  private lastList: ResolvedCursor<TContext, TUser>[] = [];

  constructor(options: ResolverOptions<TContext>) {
    this.registry = options.registry;
    this.visibilityPolicy = options.visibilityPolicy ?? (defaultVisibilityPolicy as VisibilityPolicy<TContext>);
    this.interpolatorFactory = options.interpolatorFactory ?? linearInterpolator;
    this.hitTest = options.hitTest ?? false;
  }

  /** Removes interpolator state for clientIds no longer present (call after each store snapshot changes). */
  prune(activeClientIds: ReadonlySet<string>): void {
    for (const clientId of this.states.keys()) {
      if (!activeClientIds.has(clientId)) this.states.delete(clientId);
    }
    for (const clientId of this.lastResults.keys()) {
      if (!activeClientIds.has(clientId)) this.lastResults.delete(clientId);
    }
  }

  resolveAll(
    presences: readonly CursorPresence<TContext, TUser>[],
    readState: SchedulerReadState,
    timestampMs: number,
  ): { cursors: ResolvedCursor<TContext, TUser>[]; unsettled: boolean; activeAnchors: Element[] } {
    const activeIds = new Set(presences.map((p) => p.clientId));
    this.prune(activeIds);

    const results: ResolvedCursor<TContext, TUser>[] = [];
    const activeAnchors = new Set<Element>();
    const visibleRectMemo = new Map<Element, VisibleRectEntry>();
    let unsettled = false;
    let listUnchanged = presences.length === this.lastList.length;
    for (const presence of presences) {
      const raw = resolveGeometry(presence, this.registry, readState, visibleRectMemo);
      for (const element of raw.activeAnchors) activeAnchors.add(element);
      const pointVisible = this.isPointVisible(raw, readState.viewportSize);
      const visibility = this.visibilityPolicy({
        presence,
        resolution: { tier: raw.tier, anchorId: raw.anchorId, pointVisible },
      });

      let state = this.states.get(presence.clientId);
      if (state === undefined) {
        state = {
          interpolator: this.interpolatorFactory(),
          lastRawX: raw.x,
          lastRawY: raw.y,
          lastPresence: presence,
        };
        state.interpolator.target(raw.x, raw.y, timestampMs);
        this.states.set(presence.clientId, state);
      } else if (state.lastPresence !== presence) {
        state.interpolator.target(raw.x, raw.y, timestampMs);
      } else if (raw.x !== state.lastRawX || raw.y !== state.lastRawY) {
        // local-only invalidation moved the resolved position: shift current+target by the delta, no easing
        state.interpolator.shift(raw.x - state.lastRawX, raw.y - state.lastRawY);
      }
      state.lastRawX = raw.x;
      state.lastRawY = raw.y;
      state.lastPresence = presence;

      const sample = state.interpolator.sample(timestampMs);
      if (!sample.settled) unsettled = true;

      const prev = this.lastResults.get(presence.clientId);
      let result: ResolvedCursor<TContext, TUser>;
      if (
        prev !== undefined &&
        prev.x === sample.x &&
        prev.y === sample.y &&
        prev.visible === (visibility === "show") &&
        prev.pointVisible === pointVisible &&
        prev.anchorId === raw.anchorId &&
        prev.tier === raw.tier &&
        prev.context === presence.context &&
        prev.user === presence.user
      ) {
        result = prev;
      } else {
        result = {
          clientId: presence.clientId,
          x: sample.x,
          y: sample.y,
          visible: visibility === "show",
          pointVisible,
          anchorId: raw.anchorId,
          tier: raw.tier,
        };
        if (presence.context !== undefined) result.context = presence.context;
        if (presence.user !== undefined) result.user = presence.user;
        this.lastResults.set(presence.clientId, result);
      }
      if (listUnchanged && this.lastList[results.length] !== result) listUnchanged = false;
      results.push(result);
    }
    const cursors = listUnchanged ? this.lastList : results;
    this.lastList = cursors;
    return { cursors, unsettled, activeAnchors: Array.from(activeAnchors) };
  }

  private isPointVisible(raw: RawResolution, viewportSize: ViewportSize): boolean {
    if (!raw.pointVisible || !this.hitTest || raw.element === null) return raw.pointVisible;
    if (raw.x < 0 || raw.y < 0 || raw.x >= viewportSize.width || raw.y >= viewportSize.height) return true;
    const hit = this.hitElement(raw.element.ownerDocument, raw.x, raw.y);
    if (hit === null || hit === undefined) return true;
    return raw.element.contains(hit) || this.hasComposedAncestor(hit, raw.element);
  }

  private hitElement(root: Document | ShadowRoot, x: number, y: number): Element | null {
    let hit = root.elementFromPoint?.(x, y) ?? null;
    while (hit?.shadowRoot?.mode === "open") {
      const nested = hit.shadowRoot.elementFromPoint?.(x, y) ?? null;
      if (nested === null || nested === hit) break;
      hit = nested;
    }
    return hit;
  }

  private hasComposedAncestor(element: Element, ancestor: Element): boolean {
    let current: Element | null = element;
    while (current !== null) {
      if (current === ancestor) return true;
      const host: unknown = (current.getRootNode() as { host?: unknown }).host;
      current = current.parentElement ?? (this.isElement(host) ? host : null);
    }
    return false;
  }

  private isElement(value: unknown): value is Element {
    return typeof value === "object" && value !== null && (value as Node).nodeType === 1;
  }
}
