"use client";

import type { PresenceClient } from "@anchor-presence/core";
import { CursorLayer, LiveCursorProvider, useCursorClient, useCursorEvents } from "@anchor-presence/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { READER } from "./_preview/scenes";
import { LongPage } from "./long-page";
import { safeColor } from "./safe-color";

type User = { name: string; color: string };

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

// Copy of the cursor-chat.mdx recipe; only colors and class names are added.
const CHAT_MAX_LENGTH = 100;
const CHAT_HIDE_MS = 5000;

function readChatText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const text: unknown = (data as { text?: unknown }).text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
  return trimmed === "" ? null : trimmed;
}

function useRemoteChat(): Record<string, string> {
  const [messages, setMessages] = useState<Record<string, string>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useCursorEvents((event) => {
    if (event.type !== "chat") return;
    const text = readChatText(event.data);
    if (text === null) return;
    const { clientId } = event;
    setMessages((current) => ({ ...current, [clientId]: text }));
    clearTimeout(timers.current.get(clientId));
    timers.current.set(
      clientId,
      setTimeout(() => {
        timers.current.delete(clientId);
        setMessages((current) => {
          const next = { ...current };
          delete next[clientId];
          return next;
        });
      }, CHAT_HIDE_MS),
    );
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  return messages;
}

function ChatCursorLayer() {
  const messages = useRemoteChat();
  return (
    <CursorLayer<unknown, User>
      getLabel={(cursor) => messages[cursor.clientId] ?? cursor.user?.name}
      getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
    />
  );
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

function ChatComposer() {
  const client = useCursorClient();
  const pointer = useRef({ x: 0, y: 0 });
  const bubble = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      pointer.current = { x: event.clientX, y: event.clientY };
      if (bubble.current !== null) {
        bubble.current.style.transform = `translate(${event.clientX + 16}px, ${event.clientY + 16}px)`;
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || isTextField(event.target)) return;
      event.preventDefault();
      setOrigin(pointer.current);
      setOpen(true);
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (sent === null) return;
    const timer = setTimeout(() => setSent(null), CHAT_HIDE_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setOpen(false);
    if (event.key !== "Enter") return;
    const text = readChatText({ text: event.currentTarget.value });
    setOpen(false);
    if (text !== null && client?.sendEvent("chat", { text }) === true) setSent(text);
  }

  if (!open && sent === null) return null;
  return (
    <div
      ref={bubble}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 10000,
        transform: `translate(${origin.x + 16}px, ${origin.y + 16}px)`,
      }}
    >
      {open ? (
        <input
          aria-label="Chat message"
          maxLength={CHAT_MAX_LENGTH}
          autoFocus
          onKeyDown={onInputKeyDown}
          className="w-44 rounded-md border border-fd-border bg-fd-background px-2 py-1 text-xs text-fd-foreground shadow-md"
        />
      ) : (
        <div
          role="status"
          className="rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap text-white shadow-md"
          style={{ backgroundColor: READER.color }}
        >
          {sent}
        </div>
      )}
    </div>
  );
}

export function ChatScene({ client, children }: Props) {
  return (
    <LiveCursorProvider client={client}>
      <LongPage layout="wide" />
      <ChatCursorLayer />
      <ChatComposer />
      {children}
    </LiveCursorProvider>
  );
}
