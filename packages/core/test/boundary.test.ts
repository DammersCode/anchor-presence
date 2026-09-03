import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "../src/index";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));

describe("core has zero DOM globals (spec §3.1)", () => {
  it("imports the whole package in a plain node environment without throwing", () => {
    expect(typeof core.validatePresence).toBe("function");
    expect(typeof core.jsonCodec.encode).toBe("function");
    expect(typeof core.createPresenceClient).toBe("function");
    expect(typeof core.RemotePresenceStore).toBe("function");
    expect(typeof core.linearInterpolator).toBe("function");
    expect(typeof core.noneInterpolator).toBe("function");
  });

  it("confirms this environment has no DOM globals (sanity check for the grep below)", () => {
    expect(typeof (globalThis as Record<string, unknown>).window).toBe("undefined");
    expect(typeof (globalThis as Record<string, unknown>).document).toBe("undefined");
  });

  const forbiddenTokens = ["window", "document", "Element", "getBoundingClientRect"];

  // client.ts touches `document` only behind a guard for the visibilitychange publish flush
  const guardedTokensByFile: Record<string, string[]> = {
    "client.ts": ["document"],
  };

  const files = readdirSync(srcDir).filter((name) => name.endsWith(".ts"));

  for (const file of files) {
    const guarded = new Set(guardedTokensByFile[file] ?? []);
    const tokens = forbiddenTokens.filter((token) => !guarded.has(token));
    it(`${file} never references DOM globals (${tokens.join(", ")})`, () => {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const token of tokens) {
        const regex = new RegExp(`\\b${token}\\b`);
        expect(regex.test(contents)).toBe(false);
      }
    });
  }
});
