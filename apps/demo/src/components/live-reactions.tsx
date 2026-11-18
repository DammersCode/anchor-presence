import { useCallback, useEffect, useRef, useState } from "react";
import {
  useCursorEvents,
  useLocalUser,
  usePeerChanges,
  useRemoteUsers,
  useSendEvent,
} from "../cursors/hooks";
import { DEMO_REACTIONS, MAX_CHAT_LENGTH, parseDemoEvent } from "../cursors/setup";

type Toast = { id: number; who: string; text: string };

const TOAST_MS = 3000;
const MAX_TOASTS = 5;

/** Reaction buttons and a one-line chat, both sent as one-shot events and shown as short-lived toasts. */
export function LiveReactions({ localName }: { localName: string }) {
  const send = useSendEvent();
  const [localUser] = useLocalUser();
  const users = useRemoteUsers();
  const me = localUser?.name ?? localName;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chat, setChat] = useState("");
  const nextId = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const show = useCallback((who: string, text: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, who, text }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), TOAST_MS);
  }, []);

  useCursorEvents((event) => {
    const parsed = parseDemoEvent(event);
    if (parsed === undefined) return;
    const who = users.find((user) => user.clientId === event.clientId)?.user?.name ?? "Someone";
    show(who, parsed.type === "reaction" ? parsed.emoji : parsed.text);
  });

  usePeerChanges((change) => {
    if (change.type === "update") return;
    const name = change.user?.name ?? "Someone";
    show(name, change.type === "join" ? "joined" : "left");
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const react = (emoji: string) => {
    if (send("reaction", { emoji })) show(me, emoji);
  };

  const sendChat = () => {
    const text = chat.trim().slice(0, MAX_CHAT_LENGTH);
    if (text === "") return;
    if (send("chat", { text })) show(me, text);
    setChat("");
  };

  return (
    <section
      aria-label="Reactions and chat"
      className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
    >
      <ul
        aria-live="polite"
        data-testid="reaction-feed"
        className="flex min-h-5 flex-col gap-1 text-xs text-gray-700"
      >
        {toasts.map((toast) => (
          <li key={toast.id} data-testid="reaction-toast">
            {toast.who}: {toast.text}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1">
        {DEMO_REACTIONS.map((emoji) => (
          <button
            key={emoji.name}
            type="button"
            aria-label={`Send ${emoji.name}`}
            data-testid={`reaction-${emoji.name}`}
            onClick={() => react(emoji.symbol)}
            className="rounded px-2 py-1 text-base hover:bg-gray-100"
          >
            {emoji.symbol}
          </button>
        ))}
        <input
          ref={input}
          value={chat}
          maxLength={MAX_CHAT_LENGTH}
          data-testid="chat-input"
          aria-label="Chat message, press / to focus"
          placeholder="Press / to chat"
          onChange={(event) => setChat(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") sendChat();
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          className="w-36 rounded border border-gray-200 px-2 py-1 text-xs"
        />
      </div>
    </section>
  );
}
