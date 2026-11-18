import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const packages = ["core", "dom", "react"] as const;
const built = packages.every((name) => existsSync(`packages/${name}/dist/index.js`));

describe.skipIf(!built)("built packages in a server runtime", () => {
  const runtimes = [
    ["node", ["-e"]],
    ["bun", ["-e"]],
  ] as const;

  it.each(runtimes.flatMap(([runtime, flags]) => packages.map((name) => [runtime, flags, name] as const)))(
    "imports in %s: %s/%s",
    (runtime, flags, name) => {
      const output = execFileSync(
        runtime,
        [
          ...flags,
          `import(${JSON.stringify(pathToFileURL(resolve(`packages/${name}/dist/index.js`)).href)}).then((m) => console.log(Object.keys(m).length))`,
        ],
        { encoding: "utf8" },
      );
      expect(Number(output.trim())).toBeGreaterThan(0);
    },
  );

  it("marks the react entry as a client module", () => {
    expect(readFileSync("packages/react/dist/index.js", "utf8").startsWith('"use client";')).toBe(true);
  });
});
