import { describe, expect, it } from "vitest";
import {
  adjacentPairs,
  band,
  indexView,
  jumpThresholds,
  mapPoint,
  percentile,
  scorePair,
  senderChain,
  subScore,
} from "../../skills/anchor-presence-audit/scripts/score.mjs";

const box = (left, top, width, height) => ({ left, top, width, height });

function anchor(id, rect, ancestors = []) {
  return { id, rect, measurable: true, ancestors, selector: id };
}

function view(name, anchors, width = 400, height = 300) {
  return { page: "p", name, viewport: { width, height }, anchors, gap: { uncovered: 0, containers: [] } };
}

const rowLayout = view("row", [
  anchor("bar", box(0, 0, 400, 40)),
  anchor("bar.a", box(0, 0, 100, 40), ["bar"]),
  anchor("bar.b", box(108, 0, 100, 40), ["bar"]),
]);

const stackLayout = view("stack", [
  anchor("bar", box(0, 0, 400, 88)),
  anchor("bar.a", box(0, 0, 400, 40), ["bar"]),
  anchor("bar.b", box(0, 48, 400, 40), ["bar"]),
]);

describe("sub-scores", () => {
  it("are 0 at good, 100 at poor, and linear between", () => {
    expect(subScore(40, 40, 240)).toBe(0);
    expect(subScore(140, 40, 240)).toBe(50);
    expect(subScore(500, 40, 240)).toBe(100);
  });

  it("uses nearest-rank percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([], 0.9)).toBe(0);
  });

  it("bands totals at 20 and 50", () => {
    expect([band(20), band(21), band(50), band(51)]).toEqual(["low", "moderate", "moderate", "high"]);
  });
});

describe("adjacency", () => {
  it("pairs boxes with facing edges within the adjacency distance", () => {
    const pairs = adjacentPairs(indexView(rowLayout), 24);
    expect(pairs.map((p) => [p.a.id, p.b.id, p.senderPx])).toEqual([["bar.a", "bar.b", 8]]);
  });

  it("skips boxes that touch only at a corner", () => {
    const diagonal = view("d", [anchor("a", box(0, 0, 50, 50)), anchor("b", box(50, 50, 50, 50))]);
    expect(adjacentPairs(indexView(diagonal), 24)).toEqual([]);
  });

  it("skips a container edge that a child anchor covers", () => {
    const covered = view("c", [
      anchor("row", box(0, 0, 100, 20)),
      anchor("row.cell", box(0, 0, 100, 20), ["row"]),
      anchor("next", box(0, 20, 100, 20)),
    ]);
    const ids = adjacentPairs(indexView(covered), 24).map((p) => `${p.a.id}>${p.b.id}`);
    expect(ids).toEqual(["row.cell>next"]);
  });
});

describe("mapping", () => {
  it("resolves through the first chain anchor the receiver has, else the viewport", () => {
    const sender = indexView(rowLayout);
    const partial = indexView(view("partial", [anchor("bar", box(0, 0, 200, 40))], 200, 300));
    const chain = senderChain(sender, sender.byId.get("bar.b"), 4);
    expect(mapPoint({ x: 158, y: 20 }, chain, sender, partial, 4)).toMatchObject({ depth: 1, via: "bar" });

    const empty = indexView(view("empty", [anchor("other", box(0, 0, 10, 10))], 200, 150));
    expect(mapPoint({ x: 200, y: 150 }, chain, sender, empty, 4)).toEqual({
      x: 100,
      y: 75,
      depth: 4,
      via: null,
    });
  });
});

describe("scorePair", () => {
  it("scores identical layouts as zero risk", () => {
    const pair = scorePair(rowLayout, { ...rowLayout, name: "copy" });
    expect(pair.total).toBe(0);
    expect(pair.band).toBe("low");
  });

  it("flags a row that stacks: a short move becomes a long jump", () => {
    const pair = scorePair(rowLayout, stackLayout);
    expect(pair.inputs.jumpP90Px).toBeGreaterThan(240);
    expect(pair.sub.jump).toBe(100);
    expect(pair.offenders.jumps[0]).toMatchObject({ from: "bar.a", to: "bar.b", sender: "row" });
  });

  it("keeps a maximal jump in the high band even with full coverage and no missing anchors", () => {
    const pair = scorePair(rowLayout, stackLayout);
    expect(pair.sub.gap).toBe(0);
    expect(pair.sub.parity).toBe(0);
    expect(pair.total).toBe(100);
    expect(pair.band).toBe("high");
  });

  it("flags anchors missing in one view through parity and depth", () => {
    const withoutB = view("no-b", rowLayout.anchors.slice(0, 2));
    const pair = scorePair(rowLayout, withoutB);
    expect(pair.inputs.parityMissing).toBe(0.33);
    expect(pair.inputs.depthDelta).toBe(1);
    expect(pair.offenders.fallbacks[0]).toMatchObject({ id: "bar.b", resolved: "bar" });
  });

  it("rejects an unknown jump scale", () => {
    expect(() => scorePair(rowLayout, stackLayout, { jumpScale: "em" })).toThrow(/jumpScale/u);
  });

  it("ignores anchors clipped out of view on the sender side", () => {
    const [bar, barA, barB] = rowLayout.anchors;
    const clipped = view("clipped", [bar, barA, { ...barB, visible: box(108, 0, 0, 0) }]);
    expect(adjacentPairs(indexView(clipped), 24)).toEqual([]);
  });
});

describe("jump scale", () => {
  // Neighbors 8 px apart on the sender sit 100 px apart on the receiver: a 102 px jump at any receiver width.
  const spreadAt = (width) =>
    view(
      `spread-${width}`,
      [
        anchor("bar", box(0, 0, 300, 40)),
        anchor("bar.a", box(0, 0, 100, 40), ["bar"]),
        anchor("bar.b", box(200, 0, 100, 40), ["bar"]),
      ],
      width,
    );

  it("scores px jumps the same on every receiver width, by default", () => {
    const narrow = scorePair(rowLayout, spreadAt(390));
    const wide = scorePair(rowLayout, spreadAt(1440));
    expect(narrow.inputs).toMatchObject({ jumpP90Px: 102 });
    expect(narrow.inputs).not.toHaveProperty("jumpP90Vw");
    expect(narrow.offenders.jumps[0]).not.toHaveProperty("jumpVw");
    expect(narrow.sub.jump).toBe(31);
    expect(wide.sub.jump).toBe(narrow.sub.jump);
    expect(scorePair(rowLayout, spreadAt(390), { jumpScale: "px" })).toEqual(narrow);
  });

  it("scores the same jump worse on a narrow receiver than on a wide one", () => {
    const narrow = scorePair(rowLayout, spreadAt(390), { jumpScale: "viewport" });
    const wide = scorePair(rowLayout, spreadAt(1440), { jumpScale: "viewport" });
    expect(narrow.inputs.jumpP90Vw).toBe(26.15);
    expect(wide.inputs.jumpP90Vw).toBe(7.08);
    expect(narrow.inputs).not.toHaveProperty("jumpP90Px");
    expect(narrow.offenders.jumps[0]).toMatchObject({ jumpPx: 102, jumpVw: 26.15 });
    expect(narrow.sub.jump).toBe(100);
    expect(wide.sub.jump).toBe(25);
  });

  it("matches the px score at the 1280 px reference width", () => {
    const px = scorePair(rowLayout, spreadAt(1280));
    const viewport = scorePair(rowLayout, spreadAt(1280), { jumpScale: "viewport" });
    expect(viewport.sub.jump).toBe(px.sub.jump);
    expect(jumpThresholds("viewport")).toEqual({ good: 3.125, poor: 18.75 });
  });

  it("normalizes each direction by its own receiver", () => {
    const wideStack = { ...stackLayout, viewport: { width: 800, height: 300 } };
    const pair = scorePair(rowLayout, wideStack, { jumpScale: "viewport" });
    const widths = { row: 400, stack: 800 };
    expect(new Set(pair.offenders.jumps.map((j) => j.receiver))).toEqual(new Set(["row", "stack"]));
    for (const jump of pair.offenders.jumps) {
      expect(jump.jumpVw).toBeCloseTo((100 * jump.jumpPx) / widths[jump.receiver], 1);
    }
  });
});
