// Test entry: runs the relay in the current directory and logs every auth hook call to AUTH_PROBE_FILE.
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.argv[2]);
const entry = existsSync("server.ts") ? "server.ts" : "index.ts";
const module: Record<string, unknown> = await import(pathToFileURL(path.resolve(entry)).href);
const create = Object.entries(module).find(([name]) => /^create\w+Relay$/u.test(name))?.[1] as (
  port: number,
  options: { authCheck: () => boolean },
) => unknown;
create(port, {
  authCheck: () => {
    appendFileSync(process.env.AUTH_PROBE_FILE ?? "", "x");
    return true;
  },
});
