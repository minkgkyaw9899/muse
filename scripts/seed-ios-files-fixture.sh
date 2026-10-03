#!/usr/bin/env bash
# Place the Maestro PDFs in the simulator's On My iPhone Files provider.
# Usage: seed-ios-files-fixture.sh <UDID> [--large]
# The 143 MB scan is added only with --large: a slow Files provider (such as a CI runner) stays busy
# with it, so only the cancellation flow, tagged `large`, runs with it present.
set -euo pipefail

DEVICE_ID="${1:?Pass a simulator UDID}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="$ROOT/tests/fixtures/pdf/valid-2-pages.pdf"

GROUP_URI="$(xcrun simctl listapps "$DEVICE_ID" | plutil -convert json -o - - | python3 -c '
import json, sys
apps = json.load(sys.stdin)
print(apps["com.apple.DocumentsApp"]["GroupContainers"]["group.com.apple.FileProvider.LocalStorage"])
')"
GROUP_PATH="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(urllib.parse.urlparse(sys.argv[1]).path))' "$GROUP_URI")"
DESTINATION="$GROUP_PATH/File Provider Storage/Muse Import Fixture.pdf"
mkdir -p "$(dirname "$DESTINATION")"
rsync "$FIXTURE" "$DESTINATION"
rsync "$FIXTURE" "$GROUP_PATH/File Provider Storage/Muse Duplicate Fixture.pdf"
rsync "$ROOT/tests/fixtures/pdf/corrupt-header-only.pdf" "$GROUP_PATH/File Provider Storage/Muse Damaged Fixture.pdf"
if [ "${2:-}" = "--large" ]; then
  if [ ! -f "$ROOT/.cache/fixtures/scan-100p-150mb.pdf" ]; then
    bun "$ROOT/scripts/generate-pdf-fixtures.ts" "$ROOT/.cache/fixtures"
  fi
  rsync "$ROOT/.cache/fixtures/scan-100p-150mb.pdf" "$GROUP_PATH/File Provider Storage/Muse Large Fixture.pdf"
  echo "Seeded the large Muse fixture in simulator Files"
else
  rm -f "$GROUP_PATH/File Provider Storage/Muse Large Fixture.pdf"
  echo "Seeded valid, duplicate, and damaged Muse fixtures in simulator Files"
fi
