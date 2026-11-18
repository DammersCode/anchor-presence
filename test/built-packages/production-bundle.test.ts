import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const built = existsSync("packages/core/dist/internal/dev-warnings.js");

async function bundledIsDevMode(define: string[]): Promise<boolean> {
  const output = execFileSync(
    "bun",
    ["build", "packages/core/dist/internal/dev-warnings.js", ...define, "--minify", "--target=browser"],
    { encoding: "utf8" },
  );
  const module = (await import(`data:text/javascript,${encodeURIComponent(output)}`)) as {
    isDevMode: () => boolean;
  };
  return module.isDevMode();
}

describe.skipIf(!built)("dev mode in a bundle", () => {
  it("is off when the bundler replaces process.env.NODE_ENV with production", async () => {
    expect(await bundledIsDevMode(["--define", 'process.env.NODE_ENV="production"'])).toBe(false);
  });

  it("is on when the bundler replaces it with development", async () => {
    expect(await bundledIsDevMode(["--define", 'process.env.NODE_ENV="development"'])).toBe(true);
  });
});
