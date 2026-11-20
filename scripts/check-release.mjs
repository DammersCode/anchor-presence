import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const rootDir = dirname(import.meta.dirname);
const rootVersion = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).version;
const tag = process.argv[2];
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
const failures = [];

for (const name of readdirSync(join(rootDir, "packages"))) {
  const dir = join(rootDir, "packages", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (pkg.version !== rootVersion) failures.push(`${name}: version ${pkg.version} != root ${rootVersion}`);
  for (const field of DEP_FIELDS) {
    for (const [key, value] of Object.entries(pkg[field] ?? {})) {
      if (key.startsWith("@dammers/anchor-presence-") && value !== rootVersion) {
        failures.push(`${name}: ${key} ${value} != root ${rootVersion}`);
      }
    }
  }
  if (!existsSync(join(dir, "dist", "index.js")))
    failures.push(`${name}: dist/index.js missing (run bun run build)`);
}

if (tag !== undefined && tag !== `v${rootVersion}`) failures.push(`tag ${tag} != v${rootVersion}`);

for (const line of failures) console.error(line);
process.exit(failures.length ? 1 : 0);
