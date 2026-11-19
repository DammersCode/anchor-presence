// Type-safety scan. Scores the frozen rubric in rubric.md. Usage: node scan.mjs [--list]
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const fixture = join(here, "consumer-fixture");
const packages = ["core", "dom", "react"];
const listMode = process.argv.includes("--list");

const walk = (dir, ext) =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path, ext) : ext.test(name) ? [path] : [];
      });
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const clamp = (n) => Math.max(0, Math.min(10, n));

// (a) any in emitted declarations
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
const anyHits = packages.flatMap((pkg) =>
  walk(join(root, "packages", pkg, "dist"), /\.d\.ts$/).flatMap((file) =>
    [...stripComments(readFileSync(file, "utf8")).matchAll(/\bany\b/g)].map(() => rel(file)),
  ),
);

// (b) casts in source, classified; an unmatched cast is H
const castRules = [
  ["H", /event-channel\.ts:.*listener\(event as /],
  ["H", /validate\.ts:.*as (TContext|TUser)\b/],
  ["H", /resolver\.ts:.*undefined as unknown as/],
  ["H", /use-presence-client\.ts:.*value as PresenceProviderValue/],
  ["H", /context-store\.ts:.*existing as /],
  ["F", /event-channel\.ts:.*as TypedRemoteEvent/],
  ["F", /typed-hooks\.ts:.*PresenceProvider as /],
  [
    "F",
    /(binding|use-remote-\w+|use-local-context)\.ts:.*(EMPTY_\w+ as |getServer\w+ as |undefined as TContext)/,
  ],
  ["F", /store\.ts:.*as Record<string/],
  ["L", /(ids|publish-loop|transport)\.ts:.*globalThis as /],
  ["L", /scheduler\.ts:.*win as unknown as/],
  ["L", /ingest\.ts:.*\.value as string/],
  ["L", /event-channel\.ts:.*parsers as Record/],
  ["L", /cursor\.tsx:.*memo\(/],
  ["L", /(signals|pointer|occlusion)\.ts:/],
  ["L", /transport\.ts:.*Uint8Array<ArrayBuffer>/],
  ["B", /standard-schema\.ts:.*value as \{ then/],
  ["B", /ingest\.ts:.*(event as TypedRemoteEvent|presence as PresenceMessage<)/],
  ["B", /broadcast-transport\.ts:.*event\.data as /],
  ["B", /cursor\.tsx:.*cursor\.user as /],
];
const castPattern = /\bas\s+(?!const\b)[A-Za-z_{[(]|@ts-ignore|@ts-expect-error|[\w)\]]!(?!=)[.[;,)\s]/;
const casts = [];
for (const pkg of packages) {
  for (const file of walk(join(root, "packages", pkg, "src"), /\.tsx?$/)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((raw, index) => {
        const code = raw.trim();
        if (/^(\/\/|\/?\*|import |export \*|export \{.*\} from)/.test(code)) return;
        const text = raw
          .replace(/\/\/.*$/, "")
          .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`/g, '""');
        if (!castPattern.test(text) || /^\s*(import|export) .* as /.test(text)) return;
        const where = `${rel(file)}:${index + 1}`;
        const hit = castRules.find(([, rule]) => rule.test(`${where}:${raw}`));
        casts.push({
          where,
          kind:
            /ts-ignore|(?<![=!])\b\w+!(?!=)[.[;,)\s]/.test(text) && !/ as /.test(text)
              ? "H"
              : (hit?.[0] ?? "H"),
        });
      });
  }
}
const byKind = (k) => casts.filter((c) => c.kind === k).length;
const holes = byKind("H") + byKind("F");

// (c)(d)(e) consumer fixture, compiled against staged dist
rmSync(join(fixture, "node_modules"), { recursive: true, force: true });
for (const pkg of packages) {
  const dest = join(fixture, "node_modules/@anchor-presence", pkg);
  mkdirSync(dest, { recursive: true });
  cpSync(join(root, "packages", pkg, "dist"), join(dest, "dist"), { recursive: true });
  cpSync(join(root, "packages", pkg, "package.json"), join(dest, "package.json"));
}
mkdirSync(join(fixture, "node_modules/@types"), { recursive: true });
cpSync(join(root, "packages/react/node_modules/@types/react"), join(fixture, "node_modules/@types/react"), {
  recursive: true,
  dereference: true,
});
const csstype = readdirSync(join(root, "node_modules/.bun")).find((name) => name.startsWith("csstype@"));
cpSync(
  join(root, "node_modules/.bun", csstype, "node_modules/csstype"),
  join(fixture, "node_modules/csstype"),
  { recursive: true, dereference: true },
);

const tscJs = join(root, "node_modules/typescript/lib/tsc.js");
const compile = (files, mode) => {
  const config = join(fixture, `tsconfig.tmp-${mode}.json`);
  writeFileSync(config, JSON.stringify({ extends: `./tsconfig.${mode}.json`, include: files }));
  try {
    execFileSync(process.execPath, [tscJs, "-p", config], { cwd: root, encoding: "utf8", stdio: "pipe" });
    return [];
  } catch (error) {
    return String(error.stdout)
      .split("\n")
      .filter((line) => /error TS/.test(line));
  } finally {
    rmSync(config, { force: true });
  }
};
const errorsFor = (files) =>
  ["node16", "bundler"].flatMap((mode) => compile(files, mode).map((line) => `${mode}: ${line}`));
const consumerErrors = errorsFor(["untyped.ts", "typed.ts"]);
const untypedErrors = errorsFor(["untyped.ts"]);
const typedErrors = errorsFor(["typed.ts"]);
const typedSource = readFileSync(join(fixture, "typed.ts"), "utf8");
const negatives = (typedSource.match(/@ts-expect-error/g) ?? []).length;
const positives = (typedSource.match(/assertEqual<[^\n]*\(true\)/g) ?? []).length;
const typedCap = negatives < 10 || positives < 8 ? 9 : 10;

// (f) untrusted boundary: leak sites are counted while their pattern exists
const read = (name) => readFileSync(join(root, name), "utf8");
const leaks = [
  [
    "validatePresence casts remote user/context to the generics",
    /input\.(user|context) as T(User|Context)/.test(read("packages/core/src/validate.ts")),
  ],
  [
    "createEventChannel.subscribe casts a raw event",
    /listener\(event as TypedRemoteEvent/.test(read("packages/core/src/event-channel.ts")),
  ],
  [
    "parseEvent is typed RemoteEvent -> RemoteEvent",
    /parseEvent\?: \(event: RemoteEvent\) => RemoteEvent \| undefined/.test(
      read("packages/core/src/internal/types.ts"),
    ),
  ],
  [
    "accepted: a parsers object with extra runtime keys (amendment 3, L-d)",
    /Object\.hasOwn\(parsers/.test(read("packages/core/src/event-channel.ts")),
  ],
  [
    "binary codec takes JSON.parse output as implicit any",
    /const value = JSON\.parse\(/.test(read("packages/core/src/binary-codec.ts")),
  ],
].filter(([, present]) => present);

const rows = [
  ["a emitted `any`", anyHits.length, clamp(10 - 2 * anyHits.length)],
  [
    "b cast holes (H+F)",
    `${holes} (H${byKind("H")} F${byKind("F")} L${byKind("L")} B${byKind("B")})`,
    clamp(10 - Math.ceil(holes / 3)),
  ],
  ["c consumer compile errors", consumerErrors.length, clamp(10 - consumerErrors.length)],
  ["d untyped path errors", untypedErrors.length, clamp(10 - untypedErrors.length)],
  [
    "e typed path errors",
    `${typedErrors.length} (neg ${negatives}, pos ${positives})`,
    Math.min(typedCap, clamp(10 - typedErrors.length)),
  ],
  ["f untrusted leak sites", leaks.length, clamp(10 - leaks.length)],
];
const mean = rows.reduce((sum, row) => sum + row[2], 0) / rows.length;
console.log("dimension".padEnd(30) + "count".padEnd(22) + "score");
for (const [name, count, score] of rows) console.log(name.padEnd(30) + String(count).padEnd(22) + score);
console.log(`mean ${mean.toFixed(2)}`);
if (listMode) {
  for (const cast of casts.filter((c) => c.kind === "H" || c.kind === "F"))
    console.log(`${cast.kind} ${cast.where}`);
  for (const [name] of leaks) console.log(`leak: ${name}`);
  for (const line of [...consumerErrors, ...untypedErrors, ...typedErrors].slice(0, 10))
    console.log(line.slice(0, 160));
  for (const file of anyHits) console.log(`any: ${file}`);
}
