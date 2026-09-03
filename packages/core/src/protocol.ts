// Wire types — spec §4.1

export type AnchorPoint = {
  id: string;
  u: number;
  v: number;
};

export type CursorPosition = {
  anchors: AnchorPoint[];
  viewport?: { u: number; v: number };
};

export type PointerType = "mouse" | "pen" | "touch";

export type PointerInfo = { type?: PointerType };

// `null` is a wire-level clear; a missing field means "unchanged since the previous same-session message".
export type CursorPresence<TContext = unknown, TUser = unknown> = {
  version: 1;
  clientId: string; // client INSTANCE (tab/connection), not a user
  session: string;
  sequence: number;
  cursor: CursorPosition | null;
  context?: TContext | null | undefined;
  user?: TUser | null | undefined;
  pointer?: PointerInfo;
};

// Validation limits — spec §4.2 (overridable via ValidationLimits passed to validatePresence)
export const DEFAULT_MAX_CLIENT_ID_LENGTH = 128;
export const DEFAULT_MAX_SESSION_LENGTH = 64;
export const DEFAULT_MAX_SEQUENCE = 2_147_483_647;
export const DEFAULT_MAX_ANCHORS = 8;
export const DEFAULT_MAX_ANCHOR_ID_LENGTH = 256;
export const DEFAULT_MAX_FIELD_BYTES = 8 * 1024; // 8 KiB, applies to context/user
export const DEFAULT_MAX_FIELD_DEPTH = 8; // container nesting depth, applies to context/user
export const DEFAULT_MAX_MESSAGE_BYTES = 32 * 1024; // 32 KiB, whole encoded message

// Connection status — spec §5
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
