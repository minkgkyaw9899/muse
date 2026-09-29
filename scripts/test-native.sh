#!/usr/bin/env bash
# Runs the host-side C tests for the native inspection wrapper against a macOS MuPDF build.
# Needs Xcode command line tools. Builds the host library first if it is missing.
#
# Passes: plain (includes the memory-growth check), AddressSanitizer + UBSan, ThreadSanitizer, and
# macOS `leaks` on the plain binary. Set MUSE_STUB=1 to compile the stub configuration (no MuPDF).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="1.28.5"
WORK="${MUPDF_WORKDIR:-$ROOT/.cache/mupdf-$VERSION}"
MODULE="$ROOT/modules/mupdf-renderer/ios"
OUT="$WORK/host-tests"
FIXTURES="$ROOT/tests/fixtures/pdf"
mkdir -p "$OUT"

BASE=(-g -O1 -Wall -Wextra -I"$MODULE")
LIBS=()
if [ "${MUSE_STUB:-0}" != "1" ]; then
  if [ ! -f "$WORK/host/libmupdf-all.a" ]; then
    "$ROOT/scripts/build-mupdf.sh" --host
  fi
  BASE+=(-DMUSE_HAS_MUPDF=1 -I"$WORK/src/include")
  LIBS=("$WORK/host/libmupdf-all.a")
fi

build() { # name, extra flags...
  local name="$1"; shift
  xcrun clang "${BASE[@]}" "$@" "$ROOT/tests/native/muse_inspect_test.c" "$MODULE/MuseInspect.c" \
    ${LIBS[@]+"${LIBS[@]}"} -lm -o "$OUT/$name"
}

echo "== plain =="
build plain
"$OUT/plain" "$FIXTURES"

if [ "${MUSE_STUB:-0}" = "1" ]; then exit 0; fi

echo "== AddressSanitizer + UBSan =="
build asan -fsanitize=address,undefined -DMUSE_SANITIZED=1
"$OUT/asan" "$FIXTURES"

echo "== ThreadSanitizer =="
build tsan -fsanitize=thread -DMUSE_SANITIZED=1
"$OUT/tsan" "$FIXTURES"

echo "== leaks =="
report="$(leaks --atExit -- "$OUT/plain" "$FIXTURES" 2>&1 || true)"
echo "$report" | grep -E "leaks for" || true
echo "$report" | grep -q "0 leaks for 0 total leaked bytes" || { echo "leaks reported"; exit 1; }
