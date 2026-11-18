/** A monotonic clock: a wall-clock step cannot create ghost peers or mute senders. */
export function defaultNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
