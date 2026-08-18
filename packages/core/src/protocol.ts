// Wire types — spec §4.1

export type AnchorPoint = {
  id: string; // registered semantic anchor ID
  u: number; // 0..1 across the anchor, clamped by receiver
  v: number; // 0..1 down the anchor, clamped by receiver
};

export type CursorPosition = {
  anchors: AnchorPoint[]; // ordered, most specific first
  viewport?: { u: number; v: number }; // normalized viewport fallback
};

export type CursorPresence<TContext = unknown, TUser = unknown> = {
  version: 1;
  clientId: string; // identifies a client INSTANCE (tab/connection), not a user
  session: string; // random per client instance, generated at client creation
  sequence: number; // monotonic per (clientId, session)
  cursor: CursorPosition | null; // null = pointer left / hidden
  context?: TContext; // opaque to core
  user?: TUser; // opaque to core
  pointer?: { type?: "mouse" | "pen" | "touch" };
};

// Validation limits — spec §4.2 (overridable via ValidationLimits passed to validatePresence)
export const DEFAULT_MAX_CLIENT_ID_LENGTH = 128;
export const DEFAULT_MAX_SESSION_LENGTH = 64;
export const DEFAULT_MAX_ANCHORS = 8;
export const DEFAULT_MAX_ANCHOR_ID_LENGTH = 256;
export const DEFAULT_MAX_FIELD_BYTES = 8 * 1024; // 8 KiB, applies to context/user
export const DEFAULT_MAX_MESSAGE_BYTES = 32 * 1024; // 32 KiB, whole encoded message

// Connection status — spec §5
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
