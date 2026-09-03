/**
 * One anchor point in a cursor position.
 * `u` and `v` hold the position inside the anchor element, from `0` to `1`.
 */
export type AnchorPoint = {
  id: string;
  u: number;
  v: number;
};

/**
 * The cursor position in one presence message.
 * `anchors` holds the anchor chain, most specific first.
 * `viewport` holds a position in the sender viewport, used when no anchor resolves.
 */
export type CursorPosition = {
  anchors: AnchorPoint[];
  viewport?: { u: number; v: number };
};

/** The pointer type that moved the cursor. */
export type PointerType = "mouse" | "pen" | "touch";

/** Optional pointer info attached to a presence message. */
export type PointerInfo = { type?: PointerType };

/**
 * One presence message in the wire format.
 * `clientId` names the client instance (tab or connection), not the user.
 * For `context` and `user`, `null` clears the field, and a missing field keeps the previous same-session value.
 */
export type CursorPresence<TContext = unknown, TUser = unknown> = {
  version: 1;
  clientId: string;
  session: string;
  sequence: number;
  cursor: CursorPosition | null;
  context?: TContext | null | undefined;
  user?: TUser | null | undefined;
  pointer?: PointerInfo;
};

/**
 * A remote presence without the `sequence` field.
 * The stable snapshot behind `client.getRemotePresence()`.
 * The list keeps entry and array identity while nothing observable changes.
 */
export type RemotePresence<TContext = unknown, TUser = unknown> = Omit<
  CursorPresence<TContext, TUser>,
  "sequence"
>;

/** Default maximum length of `clientId`. `validatePresence` drops a message with a longer `clientId`. */
export const DEFAULT_MAX_CLIENT_ID_LENGTH = 128;

/** Default maximum length of `session`. `validatePresence` drops a message with a longer `session`. */
export const DEFAULT_MAX_SESSION_LENGTH = 64;

/** Default maximum value of `sequence`. `validatePresence` drops a message with a higher sequence. */
export const DEFAULT_MAX_SEQUENCE = 2_147_483_647;

/** Default maximum anchors in one cursor. `validatePresence` drops the anchors past this limit. */
export const DEFAULT_MAX_ANCHORS = 8;

/** Default maximum length of an anchor `id`. `validatePresence` drops the longer anchor. */
export const DEFAULT_MAX_ANCHOR_ID_LENGTH = 256;

/** Default maximum size of `context` and `user` as JSON, in bytes. `validatePresence` drops the larger field. */
export const DEFAULT_MAX_FIELD_BYTES = 8 * 1024;

/** Default maximum nesting depth of `context` and `user`. `validatePresence` drops the deeper field. */
export const DEFAULT_MAX_FIELD_DEPTH = 8;

/**
 * Default maximum size of one encoded message, in bytes.
 * The client drops a larger wire message before it decodes.
 */
export const DEFAULT_MAX_MESSAGE_BYTES = 32 * 1024;

/**
 * The connection status the client reports.
 * The values are `connecting`, `connected`, `reconnecting`, and `disconnected`.
 */
export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";
