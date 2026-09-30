#!/usr/bin/env bash
# Place the committed PDF in the simulator's On My iPhone Files provider for Maestro.
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
echo "Seeded Muse Import Fixture.pdf in simulator Files"
