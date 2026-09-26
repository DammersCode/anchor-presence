/**
 * Eases a cursor position toward a target.
 */
export interface Interpolator {
  /**
   * Sets a new target position.
   * The ease starts from the current position.
   */
  target(x: number, y: number, timestampMs: number): void;
  /**
   * Moves the current position and the target by a delta.
   * The ease does not restart.
   */
  shift(dx: number, dy: number): void;
  /**
   * Returns the eased position at a timestamp.
   * `settled` is `true` when the position reaches the target.
   */
  sample(timestampMs: number): { x: number; y: number; settled: boolean };
  /** Clears the ease state. The next `target` snaps to the new position. */
  reset?(): void;
}

/**
 * Returns a new interpolator.
 * The resolver creates one per remote client.
 */
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

/**
 * Creates an interpolator that eases over a fixed duration.
 * The default duration is `80` milliseconds.
 * `shift` moves both endpoints, so an in-flight ease continues.
 * @param durationMs The ease duration in milliseconds. Default `80`.
 */
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
