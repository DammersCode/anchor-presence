// Pin @anchor-presence deps to the exact root version. `workspace:*` is not
// installable by npm consumers, while an exact version keeps Bun linking the workspace.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const rootDir = dirname(import.meta.dirname);
const rootPkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const version = rootPkg.version;
const SCOPE = "@dammers/anchor-presence-";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];

const manifests = [];
for (const dir of ["packages", "apps", "examples"]) {
  for (const name of readdirSync(join(rootDir, dir))) {
    const base = join(rootDir, dir, name);
    if (existsSync(join(base, "package.json")))
      manifests.push({ path: base, setsVersion: dir === "packages" });
    if (existsSync(join(base, "client", "package.json")))
      manifests.push({ path: join(base, "client"), setsVersion: false });
  }
}

for (const { path: base, setsVersion } of manifests) {
  const file = join(base, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (setsVersion) pkg.version = version;
  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (deps === undefined) continue;
    for (const key of Object.keys(deps)) {
      if (key.startsWith(SCOPE)) deps[key] = version;
    }
  }
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
