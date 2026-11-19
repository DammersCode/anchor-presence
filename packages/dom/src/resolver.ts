// Remote anchor resolution — spec §10 — and interpolation integration — spec §13

import type { PresenceMessage, InterpolatorFactory, PointerType } from "@anchor-presence/core";
import { linearInterpolator } from "@anchor-presence/core";
import type { AnchorRegistry } from "./registry.js";
import { parentAcrossShadow } from "./dom-tree.js";
import type { Rect, ViewportSize } from "./geometry.js";
import { computeVisibleRect, isPointInRect } from "./occlusion.js";
import type { SchedulerReadState } from "./scheduler.js";

/**
 * The tier that resolved a cursor.
 * `anchor` means an anchor element won. `viewport` means the sender viewport won. `hidden` means no position exists.
 */
export type ResolutionTier = "anchor" | "viewport" | "hidden";

/**
 * One resolved remote cursor, in receiver coordinates.
 * `x` and `y` are pixels in the receiver viewport.
 */
export type ResolvedCursor<TContext = unknown, TUser = unknown> = {
  /** The remote client that owns this cursor. */
  clientId: string;
  /** The X position in receiver viewport pixels. */
  x: number;
  /** The Y position in receiver viewport pixels. */
  y: number;
  /** Whether to render this cursor. The visibility policy decides. */
  visible: boolean;
  /** Whether the point sits in a visible region of the anchor. */
  pointVisible: boolean;
  /** The anchor that won the resolution. `null` when the viewport tier wins. */
  anchorId: string | null;
  /** The tier that resolved this cursor. */
  tier: ResolutionTier;
  /** The remote context value, when the sender sent one. */
  context?: TContext;
  /** The remote user value, when the sender sent one. */
  user?: TUser;
  /** `true` when the remote cursor has not changed for a while. */
  idle: boolean;
  /** The pointer type that moved the remote cursor. `undefined` when the sender sent no pointer info. */
  pointerType?: PointerType;
};

/**
 * Decides whether to show one remote cursor.
 * The resolver runs this policy for each cursor it resolves.
 */
export type VisibilityPolicy<TContext = unknown, TUser = unknown> = (input: {
  presence: PresenceMessage<TContext, TUser>;
  resolution: { tier: ResolutionTier; anchorId: string | null; pointVisible: boolean };
}) => "show" | "hide";

export const defaultVisibilityPolicy: VisibilityPolicy = ({ resolution }) =>
  resolution.tier === "hidden" ? "hide" : "show";

/** An element is measurable when connected and its rect has width > 0 and height > 0 — spec §10. */
function isMeasurable(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** Finds the first connected, measurable anchor in the chain (most specific first). */
function findResolvableAnchor(
  presence: PresenceMessage,
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

// Fills `out` without allocating; `outAnchors` is refilled in place (spec §10, steps 1-5)
function resolveGeometryInto(
  presence: PresenceMessage,
  registry: AnchorRegistry,
  readState: SchedulerReadState,
  visibleRectMemo: Map<Element, VisibleRectEntry>,
  out: RawResolution,
  outAnchors: Element[],
): void {
  const cursor = presence.cursor;
  if (cursor === null) {
    outAnchors.length = 0;
    out.x = 0;
    out.y = 0;
    out.tier = "hidden";
    out.anchorId = null;
    out.pointVisible = false;
    out.element = null;
    out.activeAnchors = outAnchors;
    return;
  }

  const resolved = findResolvableAnchor(presence, registry, (element) => readState.getRect(element));
  if (resolved !== null) {
    const anchor = cursor.anchors.find((a) => a.id === resolved.id);
    const u = anchor?.u ?? 0;
    const v = anchor?.v ?? 0;
    const x = resolved.rect.left + resolved.rect.width * u;
    const y = resolved.rect.top + resolved.rect.height * v;
    let entry = visibleRectMemo.get(resolved.element);
    if (entry === undefined) {
      const clippingAncestors: Element[] = [];
      const rect = computeVisibleRect(resolved.element, resolved.rect, readState, (ancestor) =>
        clippingAncestors.push(ancestor),
      );
      entry = { rect, clippingAncestors };
      visibleRectMemo.set(resolved.element, entry);
    }
    outAnchors.length = 0;
    outAnchors.push(resolved.element, ...entry.clippingAncestors);
    out.x = x;
    out.y = y;
    out.tier = "anchor";
    out.anchorId = resolved.id;
    out.pointVisible = isPointInRect(x, y, entry.rect);
    out.element = resolved.element;
    out.activeAnchors = outAnchors;
    return;
  }

  if (cursor.viewport !== undefined) {
    outAnchors.length = 0;
    out.x = cursor.viewport.u * readState.viewportSize.width;
    out.y = cursor.viewport.v * readState.viewportSize.height;
    out.tier = "viewport";
    out.anchorId = null;
    out.pointVisible = true;
    out.element = null;
    out.activeAnchors = outAnchors;
    return;
  }

  outAnchors.length = 0;
  out.x = 0;
  out.y = 0;
  out.tier = "hidden";
  out.anchorId = null;
  out.pointVisible = false;
  out.element = null;
  out.activeAnchors = outAnchors;
}

/** Pure geometry resolution (spec §10, steps 1-5) — no interpolation, no visibility policy. */
export function resolveGeometry(
  presence: PresenceMessage,
  registry: AnchorRegistry,
  readState: SchedulerReadState,
  visibleRectMemo?: Map<Element, VisibleRectEntry>,
): RawResolution {
  const anchors: Element[] = [];
  const out: RawResolution = {
    x: 0,
    y: 0,
    tier: "hidden",
    anchorId: null,
    pointVisible: false,
    element: null,
    activeAnchors: anchors,
  };
  resolveGeometryInto(presence, registry, readState, visibleRectMemo ?? new Map(), out, anchors);
  return out;
}

export type ResolverOptions<TContext = unknown, TUser = unknown> = {
  registry: AnchorRegistry;
  visibilityPolicy?: VisibilityPolicy<TContext, TUser> | undefined;
  interpolatorFactory?: InterpolatorFactory | undefined;
  hitTest?: boolean | undefined;
};

type InterpolatorState = {
  interpolator: ReturnType<InterpolatorFactory>;
  lastRawX: number;
  lastRawY: number;
  lastPresence: unknown;
  lastHidden: boolean;
  // reused across frames by sampleInto interpolators
  sampleBox: { x: number; y: number; settled: boolean };
};

/** Stateful resolver: tracks one interpolator per clientId, decides target() vs shift() per spec §13. */
export class RemoteResolver<TContext = unknown, TUser = unknown> {
  private readonly registry: AnchorRegistry;
  private readonly visibilityPolicy: VisibilityPolicy<TContext, TUser>;
  private readonly interpolatorFactory: InterpolatorFactory;
  private readonly hitTest: boolean;
  private readonly states = new Map<string, InterpolatorState>();
  // spec §14.1: unchanged cursors (and an unchanged list) keep their identity across passes
  private readonly lastResults = new Map<string, ResolvedCursor<TContext, TUser>>();
  private lastList: ResolvedCursor<TContext, TUser>[] = [];
  // refilled in place on each pass, so a steady frame allocates none of these
  private readonly frameActiveIds = new Set<string>();
  private readonly frameResults: ResolvedCursor<TContext, TUser>[] = [];
  private readonly frameActiveAnchors = new Set<Element>();
  private readonly frameActiveAnchorList: Element[] = [];
  private readonly frameVisibleRectMemo = new Map<Element, VisibleRectEntry>();
  private readonly rawAnchorScratch: Element[] = [];
  private readonly rawScratch: RawResolution = {
    x: 0,
    y: 0,
    tier: "hidden",
    anchorId: null,
    pointVisible: false,
    element: null,
    activeAnchors: this.rawAnchorScratch,
  };
  private readonly policyInput: {
    presence: PresenceMessage<TContext, TUser>;
    resolution: { tier: ResolutionTier; anchorId: string | null; pointVisible: boolean };
  } = {
    presence: undefined as unknown as PresenceMessage<TContext, TUser>,
    resolution: { tier: "hidden", anchorId: null, pointVisible: false },
  };

  constructor(options: ResolverOptions<TContext, TUser>) {
    this.registry = options.registry;
    this.visibilityPolicy = options.visibilityPolicy ?? defaultVisibilityPolicy;
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
    presences: readonly PresenceMessage<TContext, TUser>[],
    readState: SchedulerReadState,
    timestampMs: number,
    isIdle: (clientId: string) => boolean = () => false,
  ): { cursors: ResolvedCursor<TContext, TUser>[]; unsettled: boolean; activeAnchors: Element[] } {
    const activeIds = this.frameActiveIds;
    activeIds.clear();
    for (const presence of presences) activeIds.add(presence.clientId);
    this.prune(activeIds);

    // the last pass may have handed the scratch array out; callers may read it later, so never refill it
    const prevList = this.lastList;
    const results = prevList === this.frameResults ? [] : this.frameResults;
    const activeAnchors = this.frameActiveAnchors;
    activeAnchors.clear();
    const visibleRectMemo = this.frameVisibleRectMemo;
    visibleRectMemo.clear();
    let unsettled = false;
    let listUnchanged = presences.length === prevList.length;
    let index = 0;
    for (const presence of presences) {
      const previous = listUnchanged ? prevList[index] : undefined;
      const raw = this.rawScratch;
      const rawAnchors = this.rawAnchorScratch;
      resolveGeometryInto(presence, this.registry, readState, visibleRectMemo, raw, rawAnchors);
      for (const element of rawAnchors) activeAnchors.add(element);
      const pointVisible = this.isPointVisible(raw, readState.viewportSize);
      this.policyInput.presence = presence;
      this.policyInput.resolution.tier = raw.tier;
      this.policyInput.resolution.anchorId = raw.anchorId;
      this.policyInput.resolution.pointVisible = pointVisible;
      const visibility = this.visibilityPolicy(this.policyInput);

      let state = this.states.get(presence.clientId);
      const hidden = raw.tier === "hidden";
      if (state === undefined) {
        state = {
          interpolator: this.interpolatorFactory(),
          lastRawX: raw.x,
          lastRawY: raw.y,
          lastPresence: presence,
          lastHidden: hidden,
          sampleBox: { x: 0, y: 0, settled: true },
        };
        if (!hidden) state.interpolator.target(raw.x, raw.y, timestampMs);
        this.states.set(presence.clientId, state);
      } else if (hidden) {
        // (0,0) is a degenerate position: clear the ease so re-entry snaps instead of sliding in from the corner
        state.interpolator.reset?.();
      } else if (state.lastHidden || state.lastPresence !== presence) {
        state.interpolator.target(raw.x, raw.y, timestampMs);
      } else if (raw.x !== state.lastRawX || raw.y !== state.lastRawY) {
        // local-only invalidation moved the resolved position: shift current+target by the delta, no easing
        state.interpolator.shift(raw.x - state.lastRawX, raw.y - state.lastRawY);
      }
      state.lastHidden = hidden;
      state.lastRawX = raw.x;
      state.lastRawY = raw.y;
      state.lastPresence = presence;

      let sample: { x: number; y: number; settled: boolean };
      if (state.interpolator.sampleInto !== undefined) {
        state.interpolator.sampleInto(state.sampleBox, timestampMs);
        sample = state.sampleBox;
      } else {
        sample = state.interpolator.sample(timestampMs);
      }
      if (!sample.settled) unsettled = true;

      const idle = isIdle(presence.clientId);
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
        prev.user === presence.user &&
        prev.idle === idle &&
        prev.pointerType === presence.pointer?.type
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
          idle,
        };
        if (presence.context !== null && presence.context !== undefined) result.context = presence.context;
        if (presence.user !== null && presence.user !== undefined) result.user = presence.user;
        if (presence.pointer?.type !== undefined) result.pointerType = presence.pointer.type;
        this.lastResults.set(presence.clientId, result);
      }
      if (listUnchanged && previous !== result) listUnchanged = false;
      results[index] = result;
      index += 1;
    }
    results.length = presences.length;
    const activeAnchorList = this.frameActiveAnchorList;
    activeAnchorList.length = 0;
    for (const element of activeAnchors) activeAnchorList.push(element);
    if (listUnchanged) {
      return { cursors: this.lastList, unsettled, activeAnchors: activeAnchorList };
    }
    this.lastList = results;
    return { cursors: results, unsettled, activeAnchors: activeAnchorList };
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
      current = parentAcrossShadow(current);
    }
    return false;
  }
}
