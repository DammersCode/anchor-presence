import { execFileSync } from "node:child_process";

for (const name of ["core", "dom", "react"]) {
  const cwd = `packages/${name}`;
  for (const args of [["publint"], ["attw", "--pack", ".", "--profile", "esm-only"]]) {
    execFileSync("bunx", args, { cwd, stdio: "inherit", shell: true });
  }
}
