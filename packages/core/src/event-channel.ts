import type { PresenceClient } from "./client.js";
import type { RemoteEvent } from "./protocol.js";

/** Maps each event type to the type of its `data`. An `interface` or a `type` works. */
export type EventMap = Record<string, unknown>;

/** A remote event whose `type` and `data` follow an `EventMap`. */
export type TypedRemoteEvent<TEvents extends object> = {
  [K in keyof TEvents & string]: { clientId: string; type: K; data: TEvents[K] };
}[keyof TEvents & string];

/** Sends and receives the events of one `EventMap`. */
export type EventChannel<TEvents extends object> = {
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
export function createEventChannel<TEvents extends object = EventMap>(
  client: Pick<PresenceClient, "sendEvent" | "subscribeEvents">,
): EventChannel<TEvents> {
  return {
    send: (type, ...data) => client.sendEvent(type, data[0]),
    subscribe: (listener) => client.subscribeEvents((event) => listener(event as TypedRemoteEvent<TEvents>)),
  };
}

/** One data parser per event type. A parser returns the checked data, or `undefined` to drop the event. Use `null` for an event without data. */
export type EventParsers<TEvents extends object> = {
  [K in keyof TEvents & string]:
    ((data: unknown) => TEvents[K] | undefined) | (undefined extends TEvents[K] ? null : never);
};

/**
 * Builds a `parseEvent` option from one data parser per event type.
 * The client drops an event with an unknown type, data that its parser rejects, or data where the parser is `null`.
 */
export function createEventParser<TEvents extends object>(
  parsers: EventParsers<TEvents>,
): (event: RemoteEvent) => TypedRemoteEvent<TEvents> | undefined {
  return (event) => {
    if (!Object.hasOwn(parsers, event.type)) return;
    const parser = (parsers as Record<string, ((data: unknown) => unknown) | null>)[event.type];
    const data = parser === null ? event.data : parser?.(event.data);
    if (data === undefined && parser !== null) return;
    if (parser === null && data !== undefined) return;
    return { clientId: event.clientId, type: event.type, data } as TypedRemoteEvent<TEvents>;
  };
}
