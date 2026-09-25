import { describe, expect, it } from "vitest";
import {
  adjacentPairs,
  band,
  indexView,
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

  it("flags anchors missing in one view through parity and depth", () => {
    const withoutB = view("no-b", rowLayout.anchors.slice(0, 2));
    const pair = scorePair(rowLayout, withoutB);
    expect(pair.inputs.parityMissing).toBe(0.33);
    expect(pair.inputs.depthDelta).toBe(1);
    expect(pair.offenders.fallbacks[0]).toMatchObject({ id: "bar.b", resolved: "bar" });
  });

  it("ignores anchors clipped out of view on the sender side", () => {
    const [bar, barA, barB] = rowLayout.anchors;
    const clipped = view("clipped", [bar, barA, { ...barB, visible: box(108, 0, 0, 0) }]);
    expect(adjacentPairs(indexView(clipped), 24)).toEqual([]);
  });
});
