#!/usr/bin/env bash
# Build the real Library UI/adapters with test-only copy timing; always restore source.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:?Pass the simulator build output directory}"
cd "$ROOT"
BACKUP="$(mktemp)"
cp src/app/index.tsx "$BACKUP"
trap 'cp "$BACKUP" src/app/index.tsx; rm -f "$BACKUP"' EXIT
cp tests/e2e/library-harness.tsx src/app/index.tsx
bunx expo run:ios --configuration Release --device generic --output "$OUTPUT"
