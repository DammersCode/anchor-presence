import { describe, expect, it } from "vitest";
import { linearInterpolator, noneInterpolator } from "../src/interpolate";

describe("noneInterpolator", () => {
  it("passes target straight through and is always settled", () => {
    const interp = noneInterpolator();
    interp.target(10, 20, 0);
    expect(interp.sample(0)).toEqual({ x: 10, y: 20, settled: true });
    expect(interp.sample(1000)).toEqual({ x: 10, y: 20, settled: true });
  });

  it("shift moves the current position by a delta", () => {
    const interp = noneInterpolator();
    interp.target(10, 20, 0);
    interp.shift(5, -5);
    expect(interp.sample(0)).toEqual({ x: 15, y: 15, settled: true });
  });

  it("reset() is a no-op: sample still returns the latest target", () => {
    const interp = noneInterpolator();
    interp.target(10, 20, 0);
    interp.reset?.();
    expect(interp.sample(0)).toEqual({ x: 10, y: 20, settled: true });
  });
});

describe("linearInterpolator", () => {
  it("retargets from the position at the retarget time, not from the last sample", () => {
    const interp = linearInterpolator(100);
    interp.target(0, 0, 0);
    interp.target(100, 0, 0);
    expect(interp.sample(10).x).toBeCloseTo(10);
    interp.target(200, 0, 50);
    expect(interp.sample(50).x).toBeCloseTo(50);
    expect(interp.sample(100).x).toBeCloseTo(125);
  });

  it("snaps to the first target with no ease", () => {
    const interp = linearInterpolator(80);
    interp.target(100, 200, 0);
    expect(interp.sample(0)).toEqual({ x: 100, y: 200, settled: true });
  });

  it("eases from current to target over durationMs", () => {
    const interp = linearInterpolator(80);
    interp.target(0, 0, 0);
    interp.sample(0);

    interp.target(80, 160, 1000);
    expect(interp.sample(1000)).toEqual({ x: 0, y: 0, settled: false });

    const midpoint = interp.sample(1040); // halfway through the 80ms ease
    expect(midpoint.x).toBeCloseTo(40);
    expect(midpoint.y).toBeCloseTo(80);
    expect(midpoint.settled).toBe(false);

    const end = interp.sample(1080);
    expect(end.x).toBeCloseTo(80);
    expect(end.y).toBeCloseTo(160);
    expect(end.settled).toBe(true);
  });

  it("reports settled once the ease completes and stays settled after", () => {
    const interp = linearInterpolator(80);
    interp.target(0, 0, 0);
    interp.sample(0);
    interp.target(100, 0, 0);

    expect(interp.sample(0).settled).toBe(false);
    expect(interp.sample(80).settled).toBe(true);
    expect(interp.sample(200).settled).toBe(true);
    expect(interp.sample(200)).toEqual({ x: 100, y: 0, settled: true });
  });

  it("shift moves current and target together, letting an in-flight ease continue", () => {
    const interp = linearInterpolator(80);
    interp.target(0, 0, 0);
    interp.sample(0);
    interp.target(80, 0, 0); // ease from 0 -> 80 over 80ms starting at t=0

    const before = interp.sample(40); // halfway: x = 40
    expect(before.x).toBeCloseTo(40);
    expect(before.settled).toBe(false);

    interp.shift(10, 5); // local-only invalidation moves both endpoints

    const after = interp.sample(40);
    expect(after.settled).toBe(false); // ease continues, not truncated
    expect(after.x).toBeCloseTo(before.x + 10);
    expect(after.y).toBeCloseTo(before.y + 5);

    const end = interp.sample(80);
    expect(end.x).toBeCloseTo(90); // original target 80 + shift 10
    expect(end.settled).toBe(true);
  });

  it("reset() makes the next target snap like a first-ever target", () => {
    const interp = linearInterpolator(80);
    interp.target(100, 0, 0);
    expect(interp.sample(0)).toEqual({ x: 100, y: 0, settled: true });

    interp.reset?.();
    interp.target(0, 200, 1000);
    // without reset() this would ease from (100, 0) and sample(1000) would be (100, 0)
    expect(interp.sample(1000)).toEqual({ x: 0, y: 200, settled: true });
  });

  it("treats a zero duration as an immediate snap", () => {
    const interp = linearInterpolator(0);
    interp.target(0, 0, 0);
    interp.sample(0);
    interp.target(50, 50, 0);
    expect(interp.sample(0)).toEqual({ x: 50, y: 50, settled: true });
  });
});
