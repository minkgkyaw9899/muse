#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.cache/publication-sources-tests"
mkdir -p "$OUT"
xcrun swiftc -swift-version 5 -j 1 "$ROOT/modules/publication-import/ios/PublicationSources.swift" \
  "$ROOT/tests/native/publication_sources_test.swift" -o "$OUT/tests"
"$OUT/tests"
