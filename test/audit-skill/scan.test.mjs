import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const script = new URL(
  "../../skills/anchor-presence-audit/scripts/scan.mjs",
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const root = mkdtempSync(join(tmpdir(), "scan-"));
mkdirSync(join(root, "app"));
writeFileSync(
  join(root, "app", "page.tsx"),
  [
    "export const A = () => (",
    '  <nav data-anchor="nav" className="hidden md:block">',
    '    {open && <a data-anchor="nav.home" className="flex md:flex-col">Home</a>}',
    "  </nav>",
    ");",
  ].join("\n"),
);
writeFileSync(join(root, "app", "styles.css"), "@media (min-width: 900px) { a { color: red } }");
writeFileSync(join(root, "app", "plain.tsx"), '<div className="md:hidden">no anchors here</div>');

const scan = () => JSON.parse(execFileSync("node", [script, "--root", root, "--json"], { encoding: "utf8" }));

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("scan.mjs", () => {
  it("finds anchors, marks conditional ones, and lists the route file", () => {
    const result = scan();
    expect(result.anchors.map((a) => a.id)).toEqual(["nav", "nav.home"]);
    expect(result.anchors.map((a) => a.conditional)).toEqual([true, true]);
    expect(result.routes).toEqual(["app/page.tsx"]);
  });

  it("reads CSS breakpoints", () => {
    expect(scan().breakpoints.widths).toEqual([900]);
  });

  it("reports reflow patterns only in files that hold anchors", () => {
    const { risks } = scan();
    expect(risks["hidden-at-breakpoint"]).toEqual(["app/page.tsx:2"]);
    expect(risks["axis-flip"]).toEqual(["app/page.tsx:3"]);
  });
});
