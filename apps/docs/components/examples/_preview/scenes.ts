import type { TourTrack, TourUser } from "./tour";

export type Layout = "wide" | "narrow";

export const LAYOUTS: readonly Layout[] = ["wide", "narrow"];

export type SceneName =
  | "basics"
  | "responsive-grid"
  | "table-and-cards"
  | "kanban"
  | "dialogs"
  | "fallbacks"
  | "scroll"
  | "presence"
  | "custom-cursors"
  | "interpolation"
  | "follow"
  | "edge-arrows"
  | "chat";

type PaneCaption = { label: string; detail: string };

export type SceneMeta = {
  panes: Record<Layout, PaneCaption>;
  /** The first track is the guide the preview toolbar names. */
  tour: readonly TourTrack[];
};

// All colors reach WCAG AA against a white label.
export const READER: TourUser = { name: "You", color: "#0f766e" };
export const MIRA: TourUser = { name: "Mira", color: "#4f46e5" };
const THEO: TourUser = { name: "Theo", color: "#be185d" };
const JUN: TourUser = { name: "Jun", color: "#0369a1" };

export const SCENES: Record<SceneName, SceneMeta> = {
  basics: {
    panes: {
      wide: { label: "Wide", detail: "buttons in a row" },
      narrow: { label: "Narrow", detail: "buttons stacked" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "post.publish", u: 0.45, v: 0.55 },
          { kind: "point", anchor: "post.save", u: 0.35, v: 0.5 },
          { kind: "point", anchor: "post.preview", u: 0.6, v: 0.45 },
        ],
      },
    ],
  },
  "responsive-grid": {
    panes: {
      wide: { label: "Wide", detail: "4 columns, mixed card sizes" },
      narrow: { label: "Narrow", detail: "2 columns, cards reflow" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "metrics.traffic.fri", u: 0.5, v: 0.55 },
          { kind: "point", anchor: "metrics.revenue", u: 0.22, v: 0.5 },
          { kind: "point", anchor: "metrics.churn", u: 0.6, v: 0.55 },
          { kind: "point", anchor: "metrics.traffic.tue", u: 0.5, v: 0.8 },
          { kind: "point", anchor: "metrics.aov", u: 0.4, v: 0.5 },
        ],
      },
    ],
  },
  "table-and-cards": {
    panes: {
      wide: { label: "Wide", detail: "table, one row per invoice" },
      narrow: { label: "Narrow", detail: "one card per invoice" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "invoices.row:INV-2043.status", u: 0.3, v: 0.5 },
          { kind: "point", anchor: "invoices.row:INV-2041.amount", u: 0.7, v: 0.5 },
          { kind: "point", anchor: "invoices.row:INV-2044.action", u: 0.5, v: 0.5 },
          { kind: "point", anchor: "invoices.row:INV-2042.customer", u: 0.3, v: 0.5 },
        ],
      },
    ],
  },
  kanban: {
    panes: {
      wide: { label: "Wide", detail: "About 3 columns fit" },
      narrow: { label: "Narrow", detail: "Columns keep a fixed width, the board scrolls" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "board.card:design", u: 0.45, v: 0.4 },
          { kind: "point", anchor: "board.card:api", u: 0.5, v: 0.5 },
          { kind: "context", value: { selection: ["board.card:api"] }, dwellMs: 1200 },
          { kind: "point", anchor: "board.card:sso", u: 0.4, v: 0.5, dwellMs: 2600 },
          { kind: "context", value: { selection: [] }, dwellMs: 400 },
        ],
      },
      {
        user: THEO,
        delayMs: 700,
        steps: [
          { kind: "point", anchor: "board.card:search", u: 0.6, v: 0.45 },
          { kind: "point", anchor: "board.card:cache", u: 0.35, v: 0.6 },
          { kind: "quiet", ms: 6000 },
        ],
      },
    ],
  },
  dialogs: {
    panes: {
      wide: { label: "Wide", detail: "team board, Mira drives the invite dialog" },
      narrow: { label: "Narrow", detail: "board only, no dialog in this layout" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "team.card:ada", u: 0.5, v: 0.5 },
          { kind: "context", value: { dialog: "invite" }, dwellMs: 600 },
          { kind: "point", anchor: "team.dialog.invite.email", u: 0.5, v: 0.5, dwellMs: 3200 },
          { kind: "context", value: { dialog: null }, dwellMs: 600 },
          { kind: "point", anchor: "team.card:grace", u: 0.4, v: 0.5 },
        ],
      },
      {
        user: THEO,
        delayMs: 700,
        steps: [
          { kind: "point", anchor: "team.card:linus", u: 0.6, v: 0.5, dwellMs: 4500 },
          { kind: "quiet", ms: 5000 },
        ],
      },
    ],
  },
  fallbacks: {
    panes: {
      wide: { label: "Wide", detail: "8 orders, refund buttons" },
      narrow: { label: "Narrow", detail: "4 recent orders, no buttons" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "orders.row:1042.refund", u: 0.5, v: 0.5 },
          { kind: "point", anchor: "orders.row:1046.refund", u: 0.5, v: 0.5 },
          { kind: "point", anchor: "orders.row:1043", u: 0.3, v: 0.5 },
          { kind: "point", anchor: "orders.row:1048", u: 0.45, v: 0.5 },
        ],
      },
    ],
  },
  scroll: {
    panes: {
      wide: { label: "Wide", detail: "every thread visible" },
      narrow: { label: "Narrow", detail: "short scroll list" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "inbox.thread:2", u: 0.4, v: 0.5 },
          { kind: "point", anchor: "inbox.thread:8", u: 0.55, v: 0.5, dwellMs: 2600 },
          { kind: "point", anchor: "inbox.thread:3", u: 0.3, v: 0.5 },
          { kind: "point", anchor: "inbox.thread:6", u: 0.5, v: 0.5, dwellMs: 2200 },
        ],
      },
    ],
  },
  presence: {
    panes: {
      wide: { label: "Wide", detail: "names in the bar" },
      narrow: { label: "Narrow", detail: "avatars only" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "board.card:auth", u: 0.4, v: 0.5 },
          { kind: "point", anchor: "board.card:billing", u: 0.6, v: 0.5 },
          { kind: "point", anchor: "board.card:docs", u: 0.3, v: 0.5 },
        ],
      },
      {
        user: THEO,
        delayMs: 700,
        steps: [
          { kind: "point", anchor: "board.card:search", u: 0.5, v: 0.5 },
          { kind: "point", anchor: "board.card:export", u: 0.7, v: 0.5 },
          { kind: "quiet", ms: 6000 },
        ],
      },
      {
        user: JUN,
        delayMs: 1800,
        steps: [
          { kind: "point", anchor: "board.card:onboarding", u: 0.5, v: 0.5 },
          { kind: "point", anchor: "board.card:auth", u: 0.8, v: 0.6 },
          { kind: "leave", ms: 10_000 },
        ],
      },
    ],
  },
  "custom-cursors": {
    panes: {
      wide: { label: "Wide", detail: "name pill renderer" },
      narrow: { label: "Narrow", detail: "avatar renderer" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "canvas.hero", u: 0.35, v: 0.4 },
          { kind: "point", anchor: "canvas.logo", u: 0.5, v: 0.5 },
          { kind: "point", anchor: "canvas.button", u: 0.4, v: 0.5 },
          { kind: "point", anchor: "canvas.note", u: 0.3, v: 0.4 },
        ],
      },
    ],
  },
  interpolation: {
    panes: {
      wide: { label: "Wide", detail: "raw updates, no easing" },
      narrow: { label: "Narrow", detail: "pick an interpolator" },
    },
    tour: [
      {
        user: MIRA,
        motion: "jump",
        steps: [
          { kind: "point", anchor: "field.target:a", dwellMs: 1500 },
          { kind: "point", anchor: "field.target:c", dwellMs: 1500 },
          { kind: "point", anchor: "field.target:b", dwellMs: 1500 },
          { kind: "point", anchor: "field.target:d", dwellMs: 1500 },
        ],
      },
    ],
  },
  follow: {
    panes: {
      wide: { label: "Wide", detail: "Mira's view, every section visible" },
      narrow: { label: "Narrow", detail: "long page, follows Mira" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "doc.section:2", u: 0.5, v: 0.5 },
          { kind: "point", anchor: "doc.section:7", u: 0.4, v: 0.5, dwellMs: 2600 },
          { kind: "point", anchor: "doc.section:4", u: 0.6, v: 0.5, dwellMs: 2600 },
          { kind: "point", anchor: "doc.section:8", u: 0.5, v: 0.5, dwellMs: 2600 },
          { kind: "leave", ms: 3000 },
        ],
      },
    ],
  },
  "edge-arrows": {
    panes: {
      wide: { label: "Wide", detail: "every section visible" },
      narrow: { label: "Narrow", detail: "long page, arrows at the edge" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "doc.section:6", u: 0.3, v: 0.5, dwellMs: 2200 },
          { kind: "point", anchor: "doc.section:1", u: 0.6, v: 0.5 },
          { kind: "point", anchor: "doc.section:8", u: 0.7, v: 0.5, dwellMs: 2200 },
          { kind: "point", anchor: "doc.section:3", u: 0.3, v: 0.5, dwellMs: 2200 },
        ],
      },
      {
        user: THEO,
        delayMs: 700,
        steps: [
          { kind: "point", anchor: "doc.section:5", u: 0.6, v: 0.5, dwellMs: 2600 },
          { kind: "point", anchor: "doc.section:2", u: 0.4, v: 0.5, dwellMs: 2600 },
          { kind: "point", anchor: "doc.section:7", u: 0.8, v: 0.5, dwellMs: 2600 },
        ],
      },
    ],
  },
  chat: {
    panes: {
      wide: { label: "Wide", detail: "Mira chats as she moves" },
      narrow: { label: "Narrow", detail: "press / to reply" },
    },
    tour: [
      {
        user: MIRA,
        steps: [
          { kind: "point", anchor: "doc.section:1", u: 0.5, v: 0.5, dwellMs: 600 },
          { kind: "event", type: "chat", data: { text: "Can we cut this?" }, dwellMs: 900 },
          { kind: "point", anchor: "doc.section:4", u: 0.5, v: 0.5, dwellMs: 1000 },
          { kind: "point", anchor: "doc.section:6", u: 0.4, v: 0.5, dwellMs: 3200 },
          { kind: "point", anchor: "doc.section:3", u: 0.5, v: 0.5, dwellMs: 600 },
          { kind: "event", type: "chat", data: { text: "Budget looks right" }, dwellMs: 900 },
          { kind: "point", anchor: "doc.section:7", u: 0.4, v: 0.5, dwellMs: 1000 },
          { kind: "point", anchor: "doc.section:8", u: 0.6, v: 0.5, dwellMs: 3200 },
        ],
      },
    ],
  },
};

export function isSceneName(value: string): value is SceneName {
  return Object.hasOwn(SCENES, value);
}

export function isLayout(value: string): value is Layout {
  return value === "wide" || value === "narrow";
}
