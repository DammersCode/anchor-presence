// Pure scoring for anchor-presence layout audits. See ../scoring.md for the definitions.

export const WEIGHTS = { jump: 0.35, gap: 0.25, depth: 0.15, aspect: 0.15, parity: 0.1 };

export const THRESHOLDS = {
  jump: { good: 40, poor: 240 },
  gap: { good: 0.05, poor: 0.4 },
  aspect: { good: 1.3, poor: 3 },
  parity: { good: 0, poor: 1 },
};

export const DEFAULTS = { adjacencyPx: 24, maxAnchors: 4 };

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} Rect
 * @typedef {{ id: string, rect: Rect, visible?: Rect, measurable: boolean, ancestors: string[], selector: string }} Anchor
 * @typedef {Anchor & { visible: Rect }} IndexedAnchor
 * @typedef {{ view: string, parent: string | null, memberCount: number, uncovered: number, example: { selector: string | null } | null }} GapContainer
 * @typedef {{ page: string, name: string, viewport: { width: number, height: number }, anchors: Anchor[], gap?: { uncovered: number, containers: GapContainer[] }, error?: string }} View
 * @typedef {View & { byId: Map<string, IndexedAnchor>, measurable: IndexedAnchor[], reachable: IndexedAnchor[] }} IndexedView
 * @typedef {{ adjacencyPx: number, maxAnchors: number }} Options
 */

const ASPECT_CLAMP = 10;
const OFFENDER_LIMIT = 8;

/** Capped-linear sub-score: 0 at `good`, 100 at `poor`. */
export function subScore(x, good, poor) {
  if (poor === good) return x > good ? 100 : 0;
  return Math.min(100, Math.max(0, (100 * (x - good)) / (poor - good)));
}

export function band(total) {
  if (total <= 20) return "low";
  if (total <= 50) return "moderate";
  return "high";
}

/** Nearest-rank percentile; 0 for an empty list. */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

/**
 * Indexes a measured view: anchors by ID (the last registration wins, like the runtime registry),
 * plus the anchors a pointer can reach, which have a visible part after scroll-container clipping.
 * @param {View} view
 * @returns {IndexedView}
 */
export function indexView(view) {
  /** @type {Map<string, IndexedAnchor>} */
  const anchors = new Map();
  for (const anchor of view.anchors) {
    anchors.set(anchor.id, { ...anchor, visible: anchor.visible ?? anchor.rect });
  }
  const measurable = [...anchors.values()].filter((a) => a.measurable);
  const reachable = measurable.filter((a) => a.visible.width > 0 && a.visible.height > 0);
  return { ...view, byId: anchors, measurable, reachable };
}

function overlaps(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0) > 0;
}

function facing(a0, a1, b0, b1) {
  if (a1 <= b0) return [a1, b0];
  if (b1 <= a0) return [a0, b1];
  const mid = (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
  return [mid, mid];
}

/** The closest points of two boxes: where a pointer leaves `a` and enters `b` on the shortest path. */
export function facingPoints(a, b) {
  const [ax, bx] = facing(a.left, a.left + a.width, b.left, b.left + b.width);
  const [ay, by] = facing(a.top, a.top + a.height, b.top, b.top + b.height);
  return [
    { x: ax, y: ay },
    { x: bx, y: by },
  ];
}

function stepToward(from, to, half) {
  return from + Math.sign(to - from) * Math.min(1, half);
}

// An edge point is ambiguous between two boxes, so nudge it just inside its own box.
function nudgeInside(point, rect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return { x: stepToward(point.x, cx, rect.width / 2), y: stepToward(point.y, cy, rect.height / 2) };
}

function contains(rect, point) {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/** The most deeply nested reachable anchor under a point, the one a real pointer reports first. */
/** @param {IndexedView} view @param {{ x: number, y: number }} point */
export function deepestAt(view, point) {
  let best = null;
  for (const anchor of view.reachable) {
    if (!contains(anchor.visible, point)) continue;
    if (best === null || anchor.ancestors.length >= best.ancestors.length) best = anchor;
  }
  return best;
}

/** The chain the sender transmits for an anchor: itself plus anchored ancestors, measurable only, capped. */
/** @param {IndexedView} view @param {Anchor} anchor @param {number} maxAnchors @returns {IndexedAnchor[]} */
export function senderChain(view, anchor, maxAnchors) {
  return [anchor.id, ...anchor.ancestors]
    .map((id) => view.byId.get(id))
    .filter((entry) => entry?.measurable === true)
    .slice(0, maxAnchors);
}

/** The first chain entry the receiver can measure, and its index; `null` means the viewport tier. */
/** @param {IndexedAnchor[]} chain @param {IndexedView} receiver */
export function resolveChain(chain, receiver) {
  for (const [depth, anchor] of chain.entries()) {
    const target = receiver.byId.get(anchor.id);
    if (target?.measurable === true) return { depth, anchor, target };
  }
  return null;
}

/** Maps a sender point to the receiver the way the resolver does: first chain anchor it has, else viewport. */
export function mapPoint(point, chain, sender, receiver, maxAnchors) {
  const resolved = resolveChain(chain, receiver);
  if (resolved !== null) {
    const { anchor, target } = resolved;
    const u = (point.x - anchor.rect.left) / anchor.rect.width;
    const v = (point.y - anchor.rect.top) / anchor.rect.height;
    return {
      x: target.rect.left + target.rect.width * u,
      y: target.rect.top + target.rect.height * v,
      depth: resolved.depth,
      via: anchor.id,
    };
  }
  return {
    x: (point.x / sender.viewport.width) * receiver.viewport.width,
    y: (point.y / sender.viewport.height) * receiver.viewport.height,
    depth: maxAnchors,
    via: null,
  };
}

/**
 * Adjacent anchor pairs in one view: unrelated visible boxes with facing edges (they overlap on one axis)
 * no more than `adjacencyPx` apart, where each facing point hits its own anchor first.
 */
/** @param {IndexedView} view @param {number} adjacencyPx */
export function adjacentPairs(view, adjacencyPx) {
  const pairs = [];
  const list = view.reachable;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (a.ancestors.includes(b.id) || b.ancestors.includes(a.id)) continue;
      const ra = a.visible;
      const rb = b.visible;
      const facesX = overlaps(ra.top, ra.top + ra.height, rb.top, rb.top + rb.height);
      const facesY = overlaps(ra.left, ra.left + ra.width, rb.left, rb.left + rb.width);
      if (!facesX && !facesY) continue;
      const [pa, pb] = facingPoints(ra, rb);
      const senderPx = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (senderPx > adjacencyPx) continue;
      const leave = nudgeInside(pa, ra);
      const enter = nudgeInside(pb, rb);
      if (deepestAt(view, leave)?.id !== a.id || deepestAt(view, enter)?.id !== b.id) continue;
      pairs.push({ a, b, leave, enter, senderPx });
    }
  }
  return pairs;
}

function directionalJumps(sender, receiver, options) {
  return adjacentPairs(sender, options.adjacencyPx).map(({ a, b, leave, enter, senderPx }) => {
    const from = mapPoint(
      leave,
      senderChain(sender, a, options.maxAnchors),
      sender,
      receiver,
      options.maxAnchors,
    );
    const to = mapPoint(
      enter,
      senderChain(sender, b, options.maxAnchors),
      sender,
      receiver,
      options.maxAnchors,
    );
    return {
      sender: sender.name,
      receiver: receiver.name,
      from: a.id,
      to: b.id,
      fromSelector: a.selector,
      toSelector: b.selector,
      senderPx: round1(senderPx),
      jumpPx: round1(Math.hypot(to.x - from.x, to.y - from.y)),
      via: [from.via, to.via],
    };
  });
}

function directionalDepths(sender, receiver, options) {
  return sender.reachable.map((anchor) => {
    const chain = senderChain(sender, anchor, options.maxAnchors);
    const resolved = resolveChain(chain, receiver);
    return {
      sender: sender.name,
      receiver: receiver.name,
      id: anchor.id,
      selector: anchor.selector,
      depth: resolved?.depth ?? options.maxAnchors,
      chain: chain.map((entry) => entry.id),
      resolved: resolved?.anchor.id ?? "viewport",
    };
  });
}

function aspectOf(rect) {
  return rect.width / rect.height;
}

/** @param {IndexedView} a @param {IndexedView} b */
function aspectAmps(a, b) {
  const amps = [];
  for (const anchor of a.measurable) {
    const other = b.byId.get(anchor.id);
    if (other?.measurable !== true) continue;
    const ra = aspectOf(anchor.rect);
    const rb = aspectOf(other.rect);
    amps.push({
      id: anchor.id,
      selector: anchor.selector,
      amp: round2(Math.min(ASPECT_CLAMP, Math.max(ra, rb) / Math.min(ra, rb))),
      sizes: { [a.name]: sizeLabel(anchor.rect), [b.name]: sizeLabel(other.rect) },
    });
  }
  return amps;
}

function missingAnchors(a, b) {
  const ids = new Set([...a.measurable, ...b.measurable].map((anchor) => anchor.id));
  const missing = [];
  for (const id of ids) {
    const inA = a.byId.get(id)?.measurable === true;
    const inB = b.byId.get(id)?.measurable === true;
    if (inA !== inB) missing.push({ id, presentIn: inA ? a.name : b.name, missingIn: inA ? b.name : a.name });
  }
  return { total: ids.size, missing };
}

/**
 * @template T
 * @param {T[]} list
 * @param {(item: T) => number} by
 * @returns {T[]}
 */
function sortedDesc(list, by) {
  return list.toSorted((x, y) => by(y) - by(x));
}

const p90 = (values) => percentile(values, 0.9);

/** Scores one view pair of the same page in both directions. */
/** @param {View} viewA @param {View} viewB @param {Partial<Options>} [options] */
export function scorePair(viewA, viewB, options = DEFAULTS) {
  const a = indexView(viewA);
  const b = indexView(viewB);
  const opts = { ...DEFAULTS, ...options };

  const jumps = [...directionalJumps(a, b, opts), ...directionalJumps(b, a, opts)];
  const depths = [...directionalDepths(a, b, opts), ...directionalDepths(b, a, opts)];
  const amps = aspectAmps(a, b);
  const parity = missingAnchors(a, b);
  const gaps = [...(a.gap?.containers ?? []), ...(b.gap?.containers ?? [])];

  const inputs = {
    jumpP90Px: round1(p90(jumps.map((j) => j.jumpPx))),
    gapUncovered: round2(Math.max(a.gap?.uncovered ?? 0, b.gap?.uncovered ?? 0)),
    depthDelta: Math.max(0, ...depths.map((d) => d.depth)),
    aspectAmp: round2(amps.length === 0 ? 1 : p90(amps.map((x) => x.amp))),
    parityMissing: round2(parity.total === 0 ? 0 : parity.missing.length / parity.total),
  };

  const sub = {
    jump: subScore(inputs.jumpP90Px, THRESHOLDS.jump.good, THRESHOLDS.jump.poor),
    gap: subScore(inputs.gapUncovered, THRESHOLDS.gap.good, THRESHOLDS.gap.poor),
    depth: subScore(inputs.depthDelta, 0, opts.maxAnchors),
    aspect: subScore(inputs.aspectAmp, THRESHOLDS.aspect.good, THRESHOLDS.aspect.poor),
    parity: subScore(inputs.parityMissing, THRESHOLDS.parity.good, THRESHOLDS.parity.poor),
  };
  const weighted = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * sub[key], 0);
  // A large jump or a large gap is visible on its own; the weighted sum must not dilute it.
  const total = Math.round(Math.max(weighted, sub.jump, sub.gap));

  return {
    page: viewA.page,
    a: viewA.name,
    b: viewB.name,
    total,
    band: band(total),
    sub: Object.fromEntries(Object.entries(sub).map(([key, value]) => [key, Math.round(value)])),
    inputs,
    counts: { adjacentPairs: jumps.length, sharedAnchors: amps.length, anchorIds: parity.total },
    offenders: {
      jumps: sortedDesc(jumps, (j) => j.jumpPx).slice(0, OFFENDER_LIMIT),
      gaps: sortedDesc(
        gaps.filter((g) => g.uncovered > 0),
        (g) => g.uncovered,
      ).slice(0, OFFENDER_LIMIT),
      fallbacks: sortedDesc(
        depths.filter((d) => d.depth > 0),
        (d) => d.depth,
      ).slice(0, OFFENDER_LIMIT),
      aspect: sortedDesc(amps, (x) => x.amp).slice(0, OFFENDER_LIMIT),
      missing: parity.missing.slice(0, OFFENDER_LIMIT),
    },
  };
}

/** Scores every pair of views that share a page. */
/** @param {View[]} views @param {Partial<Options>} [options] */
export function scoreViews(views, options = DEFAULTS) {
  const pairs = [];
  const measured = views.filter((view) => view.error === undefined);
  for (let i = 0; i < measured.length; i += 1) {
    for (let j = i + 1; j < measured.length; j += 1) {
      if (measured[i].page === measured[j].page) pairs.push(scorePair(measured[i], measured[j], options));
    }
  }
  return sortedDesc(pairs, (pair) => pair.total);
}

function sizeLabel(rect) {
  return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
