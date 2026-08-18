import { createContext } from "react";
import type { PresenceClient } from "@anchor-presence/core";
import type { DomBinding } from "@anchor-presence/dom";

export type LiveCursorContextValue<TContext = unknown, TUser = unknown> = {
  client: PresenceClient<TContext, TUser> | null;
  binding: DomBinding<TContext, TUser> | null;
};

const defaultValue: LiveCursorContextValue = { client: null, binding: null };

export const LiveCursorContext = createContext<LiveCursorContextValue>(defaultValue);
