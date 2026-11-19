import { createPresenceHooks } from "../src/index";
// presence.ts

export type User = { name: string; color: string };
export type Context = { pageId?: string; typingIn?: string | null; away?: boolean; selection?: string[] };
export type Events = { reaction: { emoji: string }; chat: { text: string }; ping: undefined };

export const {
  CursorLayer,
  PresenceProvider,
  useDomBinding,
  useLocalContext,
  useLocalUser,
  usePeerChanges,
  usePresenceClient,
  useRemoteCursors,
  useRemoteCursorsSelector,
  useRemoteEvents,
  useRemotePresence,
  useRemoteUsers,
  useSendEvent,
} = createPresenceHooks<Context, User, Events>();
