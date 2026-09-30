#!/usr/bin/env bash
# Build a temporary benchmark route against the real iOS adapters. Restore source on exit.
set -euo pipefail
DEVICE_ID="${1:?Pass a booted iOS simulator UDID}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .cache/import-benchmark
BACKUP="$(mktemp)"
cp src/app/index.tsx "$BACKUP"
trap 'cp "$BACKUP" src/app/index.tsx; rm -f "$BACKUP"' EXIT
cp tests/performance/publication-import-harness.tsx src/app/index.tsx
bun scripts/generate-pdf-fixtures.ts
printf 'ARCHS = arm64\n' > .cache/import-benchmark/arm64.xcconfig
XCODE_XCCONFIG_FILE="$ROOT/.cache/import-benchmark/arm64.xcconfig" bunx expo run:ios --configuration Release --device generic --output "$ROOT/.cache/import-benchmark/build"
xcrun simctl terminate "$DEVICE_ID" com.minkgkyaw9899.muse 2>/dev/null || true
xcrun simctl install "$DEVICE_ID" .cache/import-benchmark/build/Muse.app
APP_DATA="$(xcrun simctl get_app_container "$DEVICE_ID" com.minkgkyaw9899.muse data)"
mkdir -p "$APP_DATA/Documents/benchmark-inputs"
cp tests/fixtures/pdf/valid-2-pages.pdf .cache/fixtures/scan-100p-150mb.pdf .cache/fixtures/pages-100k.pdf "$APP_DATA/Documents/benchmark-inputs/"
rm -f "$APP_DATA/Documents/import-benchmark.json"
LAUNCH="$(xcrun simctl launch "$DEVICE_ID" com.minkgkyaw9899.muse)"
PROCESS_ID="${LAUNCH##*: }"
python3 - "$PROCESS_ID" "$APP_DATA/Documents/import-benchmark.json" "$ROOT/.cache/import-benchmark" <<'PY'
import json, pathlib, subprocess, sys, time
pid, report, output = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
samples = []
deadline = time.monotonic() + 180
while time.monotonic() < deadline:
    value = subprocess.run(['ps', '-o', 'rss=', '-p', pid], capture_output=True, text=True).stdout.strip()
    if not value: raise SystemExit('Benchmark app exited')
    samples.append({'time': time.time() * 1000, 'rssKiB': int(value)})
    try:
        result = json.loads(report.read_text())
        if result['state'] in ['complete', 'failed']: break
    except (FileNotFoundError, json.JSONDecodeError): pass
    time.sleep(.02)
else: raise SystemExit('Benchmark timed out')
if result['state'] != 'complete': raise SystemExit(result.get('error', 'Benchmark failed'))
for row in result['measurements']:
    baseline = [s['rssKiB'] for s in samples if row['start'] - 500 <= s['time'] <= row['start']]
    during = [s['rssKiB'] for s in samples if row['start'] <= s['time'] <= row['end'] + 50]
    row['baselineRssKiB'] = baseline[-1] if baseline else None
    row['peakSampledRssKiB'] = max(during) if during else None
    row['rssGrowthKiB'] = row['peakSampledRssKiB'] - row['baselineRssKiB'] if baseline and during else None
(output / 'results.json').write_text(json.dumps(result, indent=2))
(output / 'rss-samples.json').write_text(json.dumps(samples))
print(json.dumps(result, indent=2))
PY
echo "Source route restored on exit. Rebuild the normal app before running Maestro."
