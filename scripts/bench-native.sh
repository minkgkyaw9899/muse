#!/usr/bin/env bash
# Benchmarks native PDF inspection on this Mac and prints a markdown table for docs/performance/.
# Generates the large fixtures under .cache/fixtures if missing (never committed).
# Each fixture runs in its own process: "cold" is the first inspection in that process (the OS file
# cache is NOT purged, since that needs sudo); "warm" is the median of the following runs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/scripts/mupdf-config.sh"
VERSION="$MUPDF_VERSION"
WORK="${MUPDF_WORKDIR:-$ROOT/.cache/mupdf-$VERSION}"
MODULE="$ROOT/modules/mupdf-renderer/ios"
FIXTURES="$ROOT/tests/fixtures/pdf"
BIG="${MUSE_BENCH_FIXTURES:-$ROOT/.cache/fixtures}"
RUNS="${MUSE_BENCH_RUNS:-5}"

if [ ! -f "$WORK/host/libmupdf-all.a" ] || ! mupdf_stamp_matches "$WORK/host"; then "$ROOT/scripts/build-mupdf.sh" --host >&2; fi
[ -f "$BIG/pages-100k.pdf" ] || bun "$ROOT/scripts/generate-pdf-fixtures.ts" "$BIG" >&2

mkdir -p "$WORK/host-tests"
xcrun clang -O2 -DMUSE_HAS_MUPDF=1 -I"$MODULE" -I"$WORK/src/include" \
  "$ROOT/tests/native/muse_inspect_bench.c" "$MODULE/MuseInspect.c" "$WORK/host/libmupdf-all.a" -lm \
  -o "$WORK/host-tests/bench" 2>/dev/null

echo "- Date: $(date -u +%Y-%m-%d)"
echo "- Machine: $(sysctl -n machdep.cpu.brand_string), $(( $(sysctl -n hw.memsize) / 1073741824 )) GB RAM, macOS $(sw_vers -productVersion)"
echo "- MuPDF: $VERSION (host build, release); commit $(git -C "$ROOT" rev-parse --short HEAD)"
echo "- Runs: 1 cold + $RUNS warm per fixture, one process per fixture"
echo
echo "| Fixture | Size (MB) | Pages | Outcome | Cold (ms) | Warm median (ms) | Hash only (ms) | Open + count, derived (ms) | Peak RSS growth (MB) | Fingerprint (first 12) |"
echo "| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |"
run() { "$WORK/host-tests/bench" "$1" "$2" "$RUNS"; }
run "$FIXTURES/valid-2-pages.pdf" 2
run "$FIXTURES/encrypted.pdf" -1
run "$FIXTURES/corrupt-header-only.pdf" -1
run "$BIG/pages-1k.pdf" 1000
run "$BIG/pages-10k.pdf" 10000
run "$BIG/pages-100k.pdf" 100000
run "$BIG/scan-100p-150mb.pdf" 100
run "$BIG/truncated-100k.pdf" -1
