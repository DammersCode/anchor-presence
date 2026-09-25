import { describe, expect, it } from "vitest";
import { CURSOR_PALETTE } from "./palette";
import { contrastRatio } from "./contrast";

const WHITE = "#ffffff";
const WCAG_AA_NORMAL_TEXT = 4.5;

describe("cursor label contrast", () => {
  it.each(CURSOR_PALETTE)("%s reaches WCAG AA against white label text", (color) => {
    expect(contrastRatio(color, WHITE)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("known reference pairs match published WCAG ratios", () => {
    expect(contrastRatio("#000000", WHITE)).toBeCloseTo(21, 0);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });
});
