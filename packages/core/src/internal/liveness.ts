import type { PublishLoop } from "./publish-loop";
import type { PresenceClientState } from "./types";

/**
 * The liveness schedules of one presence client.
 * The heartbeat resends the full state every interval; the sweep expires stale remote clients.
 */
export function startLiveness<TContext, TUser>(
  state: PresenceClientState<TContext, TUser>,
  publish: Pick<PublishLoop, "sendHeartbeat">,
): void {
  function scheduleHeartbeat(): void {
    if (state.disposed) return;
    state.heartbeatTimer = state.scheduler.setTimeout(() => {
      publish.sendHeartbeat();
      scheduleHeartbeat();
    }, state.heartbeatMs);
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
