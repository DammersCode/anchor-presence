import { execFileSync } from "node:child_process";

const bunx = process.platform === "win32" ? "bunx.exe" : "bunx";

for (const name of ["core", "dom", "react"]) {
  const cwd = `packages/${name}`;
  for (const args of [["publint"], ["attw", "--pack", ".", "--profile", "esm-only", "--quiet"]]) {
    execFileSync(bunx, args, { cwd, stdio: "inherit" });
  }
}
