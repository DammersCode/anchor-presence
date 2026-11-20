import { describe, expect, it } from "vitest";
import { CursorLayerIn } from "../src/cursor";

// The compiler wraps a component in a cache call, `(0, runtime.c)(slots)` after Vite rewrites the import.
describe.runIf(process.env.REACT_COMPILER_RUN === "1")("under the React Compiler", () => {
  it("compiles a library component", () => {
    expect(String(CursorLayerIn)).toMatch(/\.c\)\(\d+\)/u);
  });
});
