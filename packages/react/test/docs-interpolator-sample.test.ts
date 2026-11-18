import { expect, it } from "vitest";
import type { InterpolatorFactory } from "@anchor-presence/core";
import { docSample, missingLines } from "./doc-source";

// interpolation.mdx: Write a spring
const STIFFNESS = 120;
const DAMPING = 13;
const MAX_STEP_MS = 64;

const mySpringInterpolatorFactory: InterpolatorFactory = () => {
  let x = 0;
  let y = 0;
  let velocityX = 0;
  let velocityY = 0;
  let targetX = 0;
  let targetY = 0;
  let lastMs = 0;
  let started = false;
  let settled = true;

  return {
    target(nextX, nextY, timestampMs) {
      if (!started) {
        x = nextX;
        y = nextY;
        started = true;
      }
      if (settled) lastMs = timestampMs;
      targetX = nextX;
      targetY = nextY;
      settled = false;
    },
    shift(dx, dy) {
      x += dx;
      y += dy;
      targetX += dx;
      targetY += dy;
    },
    sample(timestampMs) {
      const dt = Math.min(Math.max(timestampMs - lastMs, 0), MAX_STEP_MS) / 1000;
      lastMs = timestampMs;
      if (settled) return { x, y, settled };
      velocityX += (-STIFFNESS * (x - targetX) - DAMPING * velocityX) * dt;
      velocityY += (-STIFFNESS * (y - targetY) - DAMPING * velocityY) * dt;
      x += velocityX * dt;
      y += velocityY * dt;
      if (Math.hypot(velocityX, velocityY) < 50 && Math.hypot(x - targetX, y - targetY) < 0.05) {
        x = targetX;
        y = targetY;
        velocityX = 0;
        velocityY = 0;
        settled = true;
      }
      return { x, y, settled };
    },
  };
};

it("interpolation.mdx: the spring sample matches this source", () => {
  expect(
    missingLines("docs-interpolator-sample.test.ts", docSample("core/interpolation.mdx", "STIFFNESS")),
  ).toEqual([]);
});

it("interpolation.mdx: the spring eases toward a target and settles on it", () => {
  const spring = mySpringInterpolatorFactory();
  spring.target(0, 0, 0);
  spring.target(100, 50, 0);
  let sample = spring.sample(0);
  for (let ms = 16; ms < 5000 && !sample.settled; ms += 16) sample = spring.sample(ms);

  expect(sample).toEqual({ x: 100, y: 50, settled: true });
});
