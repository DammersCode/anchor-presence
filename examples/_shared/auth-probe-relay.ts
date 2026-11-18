// Test entry: runs the relay in the current example directory and logs every auth hook call to AUTH_PROBE_FILE.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.argv[2]);
const module: Record<string, unknown> = await import(pathToFileURL(path.resolve("server.ts")).href);
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
