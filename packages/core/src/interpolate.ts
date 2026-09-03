// Interpolation — spec §13
export interface Interpolator {
  target(x: number, y: number, timestampMs: number): void;
  shift(dx: number, dy: number): void; // moves current AND target by a delta, no easing
  sample(timestampMs: number): { x: number; y: number; settled: boolean };
  /** Clears the ease state so the next target() snaps like a first-ever target. */
  reset?(): void;
}

export type InterpolatorFactory = () => Interpolator;

/** No easing: sample always returns the latest target, always settled. */
export const noneInterpolator: InterpolatorFactory = () => {
  let x = 0;
  let y = 0;

  return {
    target(nx, ny) {
      x = nx;
      y = ny;
    },
    shift(dx, dy) {
      x += dx;
      y += dy;
    },
    sample() {
      return { x, y, settled: true };
    },
    // no ease state to clear
    reset() {},
  };
};

/** Fixed-duration ease from current toward target. shift() moves both endpoints so an in-flight ease continues. */
export const linearInterpolator = (durationMs = 80): Interpolator => {
  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let startX = 0;
  let startY = 0;
  let startTimestampMs = 0;
  let hasTarget = false;
  let settled = true;

  return {
    target(x, y, timestampMs) {
      if (!hasTarget) {
        // first target ever received: snap, nothing to ease from
        currentX = x;
        currentY = y;
        targetX = x;
        targetY = y;
        hasTarget = true;
        settled = true;
        return;
      }
      startX = currentX;
      startY = currentY;
      targetX = x;
      targetY = y;
      startTimestampMs = timestampMs;
      settled = startX === targetX && startY === targetY;
    },
    shift(dx, dy) {
      currentX += dx;
      currentY += dy;
      targetX += dx;
      targetY += dy;
      startX += dx;
      startY += dy;
    },
    sample(timestampMs) {
      if (settled || durationMs <= 0) {
        currentX = targetX;
        currentY = targetY;
        settled = true;
        return { x: currentX, y: currentY, settled: true };
      }

      const elapsed = timestampMs - startTimestampMs;
      const t = elapsed >= durationMs ? 1 : elapsed <= 0 ? 0 : elapsed / durationMs;

      currentX = startX + (targetX - startX) * t;
      currentY = startY + (targetY - startY) * t;

      if (t >= 1) settled = true;
      return { x: currentX, y: currentY, settled };
    },
    // the next target() must snap like a first-ever target instead of easing from a stale position
    reset() {
      hasTarget = false;
      settled = true;
    },
  };
};
