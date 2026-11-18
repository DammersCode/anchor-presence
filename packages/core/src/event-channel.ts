import type { PresenceClient } from "./client.js";

/** Maps each event type to the type of its `data`. */
export type EventMap = Record<string, unknown>;

/** A remote event whose `type` and `data` follow an `EventMap`. */
export type TypedRemoteEvent<TEvents extends EventMap> = {
  [K in keyof TEvents & string]: { clientId: string; type: K; data: TEvents[K] };
}[keyof TEvents & string];

/** Sends and receives the events of one `EventMap`. */
export type EventChannel<TEvents extends EventMap> = {
  /** Sends an event. A misspelled type or data of the wrong type does not compile. */
  send: <K extends keyof TEvents & string>(
    type: K,
    ...data: undefined extends TEvents[K] ? [data?: TEvents[K]] : [data: TEvents[K]]
  ) => boolean;
  /** Adds a listener for remote events. Returns a function that removes it. */
  subscribe: (listener: (event: TypedRemoteEvent<TEvents>) => void) => () => void;
};

/**
 * Gives a client typed events.
 * The types describe what you send. Remote data is untrusted, so pass `parseEvent` to `createPresenceClient` to check it.
 * @param client The client whose events you type.
 */
export function createEventChannel<TEvents extends EventMap>(
  client: Pick<PresenceClient, "sendEvent" | "subscribeEvents">,
): EventChannel<TEvents> {
  return {
    send: (type, ...data) => client.sendEvent(type, data[0]),
    subscribe: (listener) => client.subscribeEvents((event) => listener(event as TypedRemoteEvent<TEvents>)),
  };
}
