# Measure test-build provider copy stages during one installed Maestro flow.
# Usage: python3 scripts/profile-publication-provider-copy.py <UDID> <FLOW> <OUTPUT_JSON>
import json
import pathlib
import subprocess
import sys
import time

udid, flow, output_path = sys.argv[1:]
output = pathlib.Path(output_path)

def app_data():
    path = subprocess.check_output(
        ['xcrun', 'simctl', 'get_app_container', udid, 'com.minkgkyaw9899.muse', 'data'],
        text=True,
    ).strip()
    return pathlib.Path(path)

(app_data() / 'Documents' / 'e2e-provider-copy.json').unlink(missing_ok=True)
samples = []
with output.with_suffix('.log').open('w') as log:
    process = subprocess.Popen(
        ['maestro', '--udid', udid, 'test', flow], stdout=log, stderr=subprocess.STDOUT,
    )
    while process.poll() is None:
        listed = subprocess.run(
            ['ps', '-axo', 'pid=,rss=,comm='], capture_output=True, text=True,
        ).stdout
        timestamp = time.time() * 1000
        for line in listed.splitlines():
            parts = line.strip().split(None, 2)
            if (len(parts) == 3 and f'/Devices/{udid}/' in parts[2]
                    and parts[2].endswith('.app/Muse')):
                samples.append({
                    'time': timestamp, 'pid': int(parts[0]), 'rssKiB': int(parts[1]),
                })
        time.sleep(.02)

if process.returncode:
    raise SystemExit(f'Maestro failed: {output.with_suffix(".log")}')
# Maestro clearState reinstalls the app with new container identities.
report = app_data() / 'Documents' / 'e2e-provider-copy.json'
rows = json.loads(report.read_text()) if report.exists() else []
assert rows, 'No native copy measurements were written by the test build'
assert samples, 'No app RSS samples were captured'
if pathlib.Path(flow).name == 'import-large.yml':
    assert {'Muse Import Fixture.pdf', 'Muse Large Fixture.pdf'} <= {row['fixture'] for row in rows}, 'Incomplete large import copy report'
for row in rows:
    assert row['native'], row
    baseline = [s for s in samples if row['start'] - 500 <= s['time'] <= row['start']]
    during = [s for s in samples if row['start'] <= s['time'] <= row['end'] + 50]
    row['baselineRssKiB'] = baseline[-1]['rssKiB'] if baseline else None
    row['peakSampledRssKiB'] = max(s['rssKiB'] for s in during) if during else None
    row['rssGrowthKiB'] = (
        row['peakSampledRssKiB'] - row['baselineRssKiB'] if baseline and during else None
    )
result = {'flow': flow, 'measurements': rows}
output.write_text(json.dumps(result, indent=2))
output.with_name(output.stem + '-rss.json').write_text(json.dumps(samples))
print(json.dumps(result))
