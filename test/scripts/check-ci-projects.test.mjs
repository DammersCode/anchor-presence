import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve("scripts/check-ci-projects.mjs");

function run(vitestConfig, workflow) {
  const dir = mkdtempSync(join(tmpdir(), "ci-projects-"));
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  writeFileSync(join(dir, "vitest.config.ts"), vitestConfig);
  writeFileSync(join(dir, ".github", "workflows", "pr.yml"), workflow);
  return spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
}

const config = (...names) => names.map((name) => `{ test: { name: "${name}" } }`).join(",\n");
const workflow = (projects) => `matrix:\n  include:\n    - name: x
      projects: ${projects}\n`;

describe("check-ci-projects", () => {
  it("passes when every project runs in the matrix", () => {
    expect(run(config("a", "b"), workflow("--project a --project b")).status).toBe(0);
  });

  it("matches a name without a trailing comma", () => {
    expect(run(`{ test: { name: "a" } }`, workflow("--project a")).status).toBe(0);
  });

  it("fails when a project is only mentioned in a YAML comment", () => {
    const result = run(config("a", "b"), `${workflow("--project a")}# --project b\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing");
  });

  it("fails when a project is commented out of the matrix line", () => {
    expect(run(config("a", "b"), workflow("--project a # --project b")).status).toBe(1);
  });

  it("fails when the workflow names an unknown project", () => {
    const result = run(config("a"), workflow("--project a --project ghost"));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ghost");
  });
});
