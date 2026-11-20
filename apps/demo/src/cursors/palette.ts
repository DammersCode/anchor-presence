// Fixed palette so the receiver can validate a remote color instead of trusting arbitrary CSS from the wire.
// Each shade keeps a >=4.5:1 contrast ratio against the white cursor label text (WCAG AA).
export const CURSOR_PALETTE = [
  "#b91c1c",
  "#b45309",
  "#047857",
  "#0369a1",
  "#4338ca",
  "#7e22ce",
  "#be185d",
  "#0f766e",
] as const;

export const DEFAULT_CURSOR_COLOR = "#6b7280"; // gray-500 fallback for unrecognized colors

export function isKnownCursorColor(color: unknown): color is (typeof CURSOR_PALETTE)[number] {
  return typeof color === "string" && CURSOR_PALETTE.some((c) => c === color);
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function colorForName(name: string): string {
  return CURSOR_PALETTE[hashString(name) % CURSOR_PALETTE.length]!;
}
