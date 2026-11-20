import type { PublishLoop } from "./publish-loop.js";
import type { PresenceClientState } from "./types.js";

/**
 * The liveness schedules of one presence client.
 * The heartbeat resends the full state every interval; the sweep expires stale remote clients.
 */
export function startLiveness<TContext, TUser, TEvents extends object>(
  state: PresenceClientState<TContext, TUser, TEvents>,
  publish: Pick<PublishLoop, "sendHeartbeat">,
): void {
  function scheduleHeartbeat(): void {
    if (state.disposed) return;
    state.heartbeatTimer = state.scheduler.setTimeout(() => {
      publish.sendHeartbeat();
      scheduleHeartbeat();
    }, state.heartbeatIntervalMs);
  }
  scheduleHeartbeat();

  function scheduleSweep(): void {
    if (state.disposed) return;
    state.sweepTimer = state.scheduler.setTimeout(() => {
      state.store.sweep();
      scheduleSweep();
    }, state.sweepIntervalMs);
  }
  scheduleSweep();
}
