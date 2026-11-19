"use client";

import type { PresenceClient } from "@anchor-presence/core";
import type { VisibilityPolicy } from "@anchor-presence/dom";
import {
  CursorLayer,
  PresenceProvider,
  useLocalContext,
  useRemoteCursors,
  useRemoteCursorsSelector,
  useRemoteUsers,
  type ResolvedCursor,
} from "@anchor-presence/react";
import { Plus, X } from "lucide-react";
import { useRef, type ReactNode, type RefObject } from "react";

const safeColor = (color: string | undefined, fallback: string) =>
  color !== undefined && /^#[0-9a-f]{6}$/iu.test(color) ? color : fallback;

type User = { name: string; color: string };
type Context = { selection?: string[] };
type Groups = Record<string, string[]>;
type Placement = { anchorId: string; clientId: string };
type Cursor = ResolvedCursor<Context, User>;

type Props = {
  client: PresenceClient<unknown, User> | null;
  layout: "wide" | "narrow";
  children?: ReactNode;
};

const COLUMNS = [
  {
    id: "todo",
    title: "To do",
    cards: [
      { id: "design", title: "Design empty state" },
      { id: "cache", title: "Offline cache" },
      { id: "a11y", title: "Accessibility pass" },
    ],
  },
  {
    id: "doing",
    title: "In progress",
    cards: [
      { id: "api", title: "API rate limit" },
      { id: "search", title: "Search filters" },
    ],
  },
  {
    id: "blocked",
    title: "Blocked",
    cards: [{ id: "webhook", title: "Webhook retries" }],
  },
  {
    id: "done",
    title: "Done",
    cards: [
      { id: "sso", title: "SSO login" },
      { id: "export", title: "CSV export" },
      { id: "onboard", title: "Onboarding tour" },
    ],
  },
  {
    id: "backlog",
    title: "Backlog",
    cards: [
      { id: "mobile", title: "Mobile app" },
      { id: "themes", title: "Dark theme" },
    ],
  },
];

// Columns keep their size when the pane shrinks; the board scrolls instead of squishing them.
const COLUMN_WIDTH = "w-36";

// Hide a cursor whose anchor is still in the DOM but scrolled out of the board.
const clippedPointPolicy: VisibilityPolicy = ({ resolution }) =>
  !resolution.pointVisible || resolution.tier === "hidden" ? "hide" : "show";

const bindingOptions = { resolution: { visibilityPolicy: clippedPointPolicy } };

function group(placements: Placement[]): Groups {
  const groups: Groups = {};
  for (const { anchorId, clientId } of placements) (groups[anchorId] ??= []).push(clientId);
  for (const clientIds of Object.values(groups)) clientIds.sort();
  return groups;
}

function selectedIds(context: Context | undefined): string[] {
  const selection: unknown = context?.selection;
  return Array.isArray(selection) ? selection.filter((id): id is string => typeof id === "string") : [];
}

const whoIsOn = (cursors: Cursor[]) =>
  group(
    cursors.flatMap(({ anchorId, clientId, visible }) =>
      visible && anchorId !== null ? [{ anchorId, clientId }] : [],
    ),
  );

const whoPicked = (cursors: Cursor[]) =>
  group(
    cursors.flatMap(({ clientId, context }) =>
      selectedIds(context).map((anchorId) => ({ anchorId, clientId })),
    ),
  );

function sameGroups(a: Groups, b: Groups): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key]?.join() === b[key]?.join());
}

function useCardPeers() {
  const here = useRemoteCursorsSelector(whoIsOn, sameGroups);
  const picked = useRemoteCursorsSelector(whoPicked, sameGroups);
  const users = useRemoteUsers<User>();
  const [context, setContext] = useLocalContext<Context>();
  const mine = selectedIds(context);
  const byClient = (clientIds: string[] = []) => users.filter(({ clientId }) => clientIds.includes(clientId));

  return {
    peersOn: (anchorId: string) => byClient(here[anchorId]),
    peerPicking: (anchorId: string) => byClient(picked[anchorId])[0],
    isSelected: (anchorId: string) => mine.includes(anchorId),
    toggle: (anchorId: string) => setContext({ selection: mine.includes(anchorId) ? [] : [anchorId] }),
  };
}

type CardPeers = ReturnType<typeof useCardPeers>;

function CardTile({ id, title, peers }: { id: string; title: string; peers: CardPeers }) {
  const anchorId = `board.card:${id}`;
  const picker = peers.peerPicking(anchorId);
  const selected = peers.isSelected(anchorId);

  return (
    <div
      data-anchor={anchorId}
      className={`flex items-center gap-1.5 rounded-md border bg-fd-background px-2 py-1.5 shadow-xs ${selected ? "border-fd-primary" : "border-fd-border"}`}
      style={
        picker !== undefined
          ? { boxShadow: `0 0 0 2px ${safeColor(picker.user?.color, "#4f46e5")}` }
          : undefined
      }
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => peers.toggle(anchorId)}
        className="min-w-0 flex-1 truncate text-left text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
      >
        {title}
      </button>
      <span className="flex -space-x-1">
        {peers.peersOn(anchorId).map(({ clientId, user }) => (
          <span
            key={clientId}
            title={user?.name ?? "Guest"}
            className="grid size-4 place-items-center rounded-full text-[8px] font-semibold text-white ring-2 ring-fd-background"
            style={{ backgroundColor: safeColor(user?.color, "#6b7280") }}
          >
            {(user?.name ?? "?").charAt(0)}
          </span>
        ))}
      </span>
      <button
        type="button"
        data-anchor={`${anchorId}.delete`}
        aria-label={`Delete ${title}`}
        className="grid size-4 flex-none place-items-center rounded text-fd-muted-foreground hover:bg-fd-secondary hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function OutOfViewHint({ boardRef }: { boardRef: RefObject<HTMLDivElement | null> }) {
  const clipped = useRemoteCursors<unknown, User>().find(
    (cursor) => cursor.tier === "anchor" && !cursor.pointVisible,
  );
  if (clipped === undefined || clipped.anchorId === null) return null;

  const anchorId = clipped.anchorId;
  const right = clipped.x > (boardRef.current?.getBoundingClientRect().right ?? 0);
  const reveal = () =>
    boardRef.current
      ?.querySelector(`[data-anchor="${CSS.escape(anchorId)}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });

  return (
    <button
      type="button"
      onClick={reveal}
      className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring ${right ? "right-2" : "left-2"}`}
      style={{ backgroundColor: safeColor(clipped.user?.color, "#4f46e5") }}
    >
      {clipped.user?.name ?? "the cursor"} {right ? "→" : "←"}
    </button>
  );
}

export function KanbanScene({ client, layout, children }: Props) {
  return (
    <PresenceProvider client={client} bindingOptions={bindingOptions}>
      <Board />
      <CursorLayer<unknown, User>
        getLabel={(cursor) => cursor.user?.name ?? null}
        getColor={(cursor) => safeColor(cursor.user?.color, "#4f46e5")}
      />
      {children}
    </PresenceProvider>
  );
}

function Board() {
  const boardRef = useRef<HTMLDivElement>(null);
  const peers = useCardPeers();

  return (
    <div data-anchor="board" className="flex h-full flex-col p-2.5">
      <h3 className="font-display px-1 pb-1.5 text-sm font-semibold">Board</h3>
      <div className="relative min-h-0 flex-1">
        <div ref={boardRef} className="flex h-full gap-2 overflow-x-auto">
          {COLUMNS.map((column) => (
            <section
              key={column.id}
              data-anchor={`board.column:${column.id}`}
              className={`flex h-full flex-none flex-col gap-1.5 rounded-md bg-fd-secondary/60 p-1.5 ${COLUMN_WIDTH}`}
            >
              <header className="flex items-center justify-between gap-1 px-1">
                <h4 className="text-[10px] font-semibold tracking-wide text-fd-muted-foreground uppercase">
                  {column.title} <span className="font-normal">{column.cards.length}</span>
                </h4>
                <button
                  type="button"
                  data-anchor={`board.column:${column.id}.add`}
                  aria-label={`Add a card to ${column.title}`}
                  className="grid size-4 place-items-center rounded text-fd-muted-foreground hover:bg-fd-background hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fd-ring"
                >
                  <Plus className="size-3" />
                </button>
              </header>
              <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
                {column.cards.map((card) => (
                  <CardTile key={card.id} id={card.id} title={card.title} peers={peers} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <OutOfViewHint boardRef={boardRef} />
      </div>
      <p className="px-1 pt-2 text-[11px] text-fd-muted-foreground">
        Columns keep their size. Scroll the board to find a cursor that is out of view.
      </p>
    </div>
  );
}
