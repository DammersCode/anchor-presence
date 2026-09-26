import { describe, expect, it } from "vitest";
import { INTERPOLATOR_STYLES, interpolatorRegistry, springInterpolator } from "./interpolators";

describe("springInterpolator", () => {
  it("snaps to the first target and reports settled", () => {
    const spring = springInterpolator();
    spring.target(100, 50, 0);
    expect(spring.sample(16)).toEqual({ x: 100, y: 50, settled: true });
  });

  it("converges to a retargeted position and settles exactly on it", () => {
    const spring = springInterpolator();
    spring.target(0, 0, 0);
    spring.target(200, 100, 0);

    let last = spring.sample(0);
    for (let t = 16; t <= 5000 && !last.settled; t += 16) {
      last = spring.sample(t);
    }
    expect(last).toEqual({ x: 200, y: 100, settled: true });
  });

  it("moves toward the target without overshooting past double the distance", () => {
    const spring = springInterpolator();
    spring.target(0, 0, 0);
    spring.target(100, 0, 0);

    for (let t = 16; t <= 2000; t += 16) {
      const { x } = spring.sample(t);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(200);
    }
  });

  it("shift() displaces current and target together while settled", () => {
    const spring = springInterpolator();
    spring.target(10, 10, 0);
    spring.shift(5, -5);
    expect(spring.sample(16)).toEqual({ x: 15, y: 5, settled: true });
  });

  it("shift() during motion keeps converging to the shifted target", () => {
    const spring = springInterpolator();
    spring.target(0, 0, 0);
    spring.target(100, 0, 0);
    spring.sample(16);
    spring.shift(50, 0);

    let last = spring.sample(32);
    for (let t = 48; t <= 5000 && !last.settled; t += 16) {
      last = spring.sample(t);
    }
    expect(last).toEqual({ x: 150, y: 0, settled: true });
  });

  it("clamps a long stall so a tab-switch gap does not fling the spring", () => {
    const spring = springInterpolator();
    spring.target(0, 0, 0);
    spring.target(100, 0, 0);

    const { x } = spring.sample(10_000);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(100);
    expect(Number.isFinite(x)).toBe(true);
  });
});

describe("interpolatorRegistry", () => {
  it("provides a factory for every advertised style", () => {
    for (const style of INTERPOLATOR_STYLES) {
      const interpolator = interpolatorRegistry[style]();
      interpolator.target(1, 2, 0);
      expect(interpolator.sample(16)).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    }
  });
});
