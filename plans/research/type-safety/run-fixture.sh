#!/bin/sh
# Stage packages/*/dist as installed packages (workspace links do not resolve on Windows), then compile the fixture.
root="$(cd "$(dirname "$0")/../../.." && pwd)"
fixture="$root/plans/research/type-safety/consumer-fixture"
rm -rf "$fixture/node_modules"
for pkg in core dom react; do
  dest="$fixture/node_modules/@anchor-presence/$pkg"
  mkdir -p "$dest" && cp -r "$root/packages/$pkg/dist" "$root/packages/$pkg/package.json" "$dest/"
done
mkdir -p "$fixture/node_modules/@types" && cp -r "$root/packages/react/node_modules/@types/react" "$fixture/node_modules/@types/react" && cp -r "$root/node_modules/.bun/csstype@3.2.3/node_modules/csstype" "$fixture/node_modules/csstype"
status=0
cd "$root" || exit 2
for mode in node16 bundler; do
  echo "== $mode"
  node_modules/.bin/tsc -p "plans/research/type-safety/consumer-fixture/tsconfig.$mode.json" || status=1
done
exit $status
