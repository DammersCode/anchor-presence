const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

export function safeColor(color: string | undefined, fallback = "#4f46e5"): string {
  return color !== undefined && HEX_COLOR.test(color) ? color : fallback;
}
