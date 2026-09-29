#!/usr/bin/env bash
# Runs the host-side C tests for the native inspection wrapper against a macOS MuPDF build.
# Needs Xcode command line tools. Builds the host library first if it is missing.
# Set MUSE_STUB=1 to compile the stub configuration (no MuPDF) instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="1.28.5"
WORK="${MUPDF_WORKDIR:-$ROOT/.cache/mupdf-$VERSION}"
MODULE="$ROOT/modules/mupdf-renderer/ios"
OUT="$WORK/host-tests"
mkdir -p "$OUT"

FLAGS=(-fsanitize=address,undefined -g -O1 -Wall -Wextra -I"$MODULE")
LIBS=()
if [ "${MUSE_STUB:-0}" != "1" ]; then
  if [ ! -f "$WORK/host/libmupdf-all.a" ]; then
    "$ROOT/scripts/build-mupdf.sh" --host
  fi
  FLAGS+=(-DMUSE_HAS_MUPDF=1 -I"$WORK/src/include")
  LIBS=("$WORK/host/libmupdf-all.a")
fi

xcrun clang "${FLAGS[@]}" "$ROOT/tests/native/muse_inspect_test.c" "$MODULE/MuseInspect.c" \
  ${LIBS[@]+"${LIBS[@]}"} -lm -o "$OUT/muse_inspect_test"
"$OUT/muse_inspect_test" "$ROOT/tests/fixtures/pdf"
