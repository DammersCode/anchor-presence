// Demo-authored interpolator styles, built against the public Interpolator interface (packages/core/src/interpolate.ts).
// Owner decision: the library ships only none/linear; anything richer is application code. See docs/react.md.
import { noneInterpolator, linearInterpolator } from "@anchor-presence/core";
import type { Interpolator, InterpolatorFactory } from "@anchor-presence/core";

const SETTLE_VELOCITY = 0.05; // px/ms
const SETTLE_DISTANCE = 0.05; // px
const MAX_DT_MS = 64; // clamp so a tab-switch stall doesn't fling the spring

/** Semi-implicit Euler spring. target() retargets without resetting velocity; shift() displaces current+target, velocity untouched. */
export const springInterpolator = (stiffness = 170, damping = 26): Interpolator => {
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let velocityX = 0;
  let velocityY = 0;
  let lastTimestampMs = 0;
  let hasTarget = false;
  let settled = true;

  return {
    target(x, y, timestampMs) {
      if (!hasTarget) {
        // first target ever received: snap, nothing to spring from
        currentX = x;
        currentY = y;
        hasTarget = true;
        lastTimestampMs = timestampMs;
        settled = true;
      } else {
        settled = false;
      }
      targetX = x;
      targetY = y;
    },
    shift(dx, dy) {
      currentX += dx;
      currentY += dy;
      targetX += dx;
      targetY += dy;
    },
    sample(timestampMs) {
      if (settled) {
        lastTimestampMs = timestampMs;
        return { x: currentX, y: currentY, settled: true };
      }

      const dt = Math.min(Math.max(timestampMs - lastTimestampMs, 0), MAX_DT_MS);
      lastTimestampMs = timestampMs;

      if (dt > 0) {
        const dtSec = dt / 1000;
        // semi-implicit Euler: update velocity from spring force first, then integrate position with the new velocity
        const accelX = -stiffness * (currentX - targetX) - damping * velocityX;
        const accelY = -stiffness * (currentY - targetY) - damping * velocityY;
        velocityX += accelX * dtSec;
        velocityY += accelY * dtSec;
        currentX += velocityX * dtSec;
        currentY += velocityY * dtSec;
      }

      const speed = Math.hypot(velocityX, velocityY);
      const distance = Math.hypot(currentX - targetX, currentY - targetY);
      if (speed < SETTLE_VELOCITY && distance < SETTLE_DISTANCE) {
        currentX = targetX;
        currentY = targetY;
        velocityX = 0;
        velocityY = 0;
        settled = true;
      }

      return { x: currentX, y: currentY, settled };
    },
  };
};

export type InterpolatorStyle = "none" | "linear" | "spring";

export const INTERPOLATOR_STYLES: readonly InterpolatorStyle[] = ["none", "linear", "spring"];

export const interpolatorRegistry: Record<InterpolatorStyle, InterpolatorFactory> = {
  none: noneInterpolator,
  linear: () => linearInterpolator(),
  spring: () => springInterpolator(),
};
