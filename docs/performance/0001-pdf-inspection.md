# PDF inspection performance (ticket #5)

Evidence for the native inspection seam: how long `DocumentRenderer.inspect` takes, how much memory it uses, and what it adds to the app binary. Inspection reads a file once for its SHA-256 fingerprint, then opens it with MuPDF to count pages. It renders nothing.

## Method

- Benchmark: `bun run bench:native` (macOS only). It builds MuPDF for the host, generates the large fixtures under `.cache/fixtures` with `scripts/generate-pdf-fixtures.ts` (never committed), and runs each fixture in its own process: 1 cold run, then 7 warm runs.
- **Cold** is the first inspection in a fresh process. The operating system file cache is **not** purged (that needs `sudo`), so cold measures process and MuPDF start-up, not disk reads.
- **Hash only** times the same read-and-SHA-256 loop without MuPDF. **Open + count** is warm median minus hash only (derived, so it can read 0.0 when hashing dominates).
- Peak RSS growth is `ru_maxrss` after minus before, in the benchmark process.
- Page counts were checked against MuPDF's own `mutool info`. Generated fixtures are deterministic (pseudo-random image bytes from SHA-256 in counter mode), so the fingerprint column is stable across regenerations.

## Environment

- Date: 2026-09-29
- Machine: Apple M4, 16 GB RAM, macOS 27.0 (host Mac; **not** a physical iPhone and not the iOS simulator process)
- MuPDF 1.28.5, release build, trimmed fonts (see below); measured at the commit that adds the review fixes to slice 8

## Results

| Fixture | Size (MB) | Pages | Outcome | Cold (ms) | Warm median (ms) | Hash only (ms) | Open + count, derived (ms) | Peak RSS growth (MB) | Fingerprint (first 12) |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| valid-2-pages.pdf | 0.0 | 2 | ok | 3.3 | 0.6 | 0.0 | 0.6 | 2.3 | fe29a275f5a0 |
| encrypted.pdf | 0.0 | 0 | pdf_encrypted | 18.9 | 10.8 | 0.0 | 10.7 | 2.4 | - |
| corrupt-header-only.pdf | 0.0 | 0 | pdf_corrupt | 1.8 | 0.3 | 0.0 | 0.3 | 2.2 | - |
| pages-1k.pdf | 0.1 | 1000 | ok | 0.6 | 0.3 | 0.0 | 0.3 | 2.4 | c757baaca36e |
| pages-10k.pdf | 1.0 | 10000 | ok | 1.1 | 0.8 | 0.3 | 0.4 | 2.8 | e7dd24c03f5c |
| pages-100k.pdf | 10.0 | 100000 | ok | 6.5 | 5.7 | 3.4 | 2.3 | 6.6 | af0098e30493 |
| scan-100p-150mb.pdf | 143.1 | 100 | ok | 53.5 | 53.6 | 52.8 | 0.8 | 2.4 | 51896b675ac8 |
| truncated-100k.pdf | 5.0 | 0 | pdf_corrupt | 51.0 | 44.6 | 1.9 | 42.8 | 6.4 | - |

| Fixture | What it is |
| --- | --- |
| valid-2-pages.pdf | Tiny PDF with no cross-reference table (repaired on open), committed. |
| encrypted.pdf | The same PDF encrypted with AES-256, committed. |
| corrupt-header-only.pdf | Starts with `%PDF-`, no structure, committed. |
| pages-1k / 10k / 100k | Empty pages under a balanced page tree (fan-out 100), generated. |
| scan-100p-150mb | 100 pages with a 1.5 MB image stream each (143 MB), generated. |
| truncated-100k | pages-100k cut in half, forces MuPDF's repair scan, generated. |

## Findings

- **Page count barely matters; file size does.** 100,000 pages inspect in about 6 ms warm and 7 ms cold. Open plus count grows with the cross-reference table (0.3 ms at 1,000 pages, 0.5 ms at 10,000, 2.3 ms at 100,000), which is small in absolute terms. The 143 MB scan is 100 pages but takes about 54 ms, nearly all of it hashing at roughly 2.7 GB/s. The requirement "opening cost scales with the first viewport, not page count" holds for the metadata read; the fingerprint is proportional to file bytes and is the dominant cost for large files.
- **Memory is bounded.** Peak RSS growth stayed under 7 MB for every fixture, including the 143 MB file (streaming hash, 64 KB buffer) and the 100,000-page document. 1,200 repeated inspections across success, failure, and cancellation showed no growth and no leaks (`bun run test:native`).
- **Damaged files cost more.** A file that needs MuPDF's repair scan (truncated-100k, 5 MB) takes about 45 ms, versus 6 ms for the intact 10 MB file. Repair runs inside MuPDF's open call, so it is bounded by the byte limit but is **not** cancellable: a cancel issued during a repair takes effect when it returns.
- **Encrypted files pay a key-derivation cost.** About 10 ms for the AES-256 fixture, independent of file size.
- **Cancel latency (bound, not a measurement).** A host test asserts that a running inspection of a 1 GB sparse file returns `cancelled` within 250 ms of the cancel; the assertion catches regressions but the 250 ms figure is a chosen bound, not a measured worst case. Cancels are honored between 64 KB reads and around the MuPDF open, not during it.
- **Linked size (the important cost).** An inspection-only binary (macOS arm64, `-dead_strip`, stripped) was **38.1 MB** with MuPDF's default bundled fonts, of which about 36 MB was embedded font data (`__const`) and 2.9 MB was code. Building MuPDF with `-DTOFU -DTOFU_CJK -DTOFU_EMOJI -DTOFU_HISTORIC -DTOFU_SYMBOL -DTOFU_SIL` (drops the bundled Noto fonts, keeps the base-14 fonts) gives **6.1 MB**, about 6 times smaller, and the iOS xcframework drops from 124 MB to 34 MB (static libraries, before linking). Inspection needs no fonts, so the build now uses the trimmed flags by default (`scripts/mupdf-config.sh`). The Reader will need to revisit this when it renders text: choose which fallback fonts to ship or supply system fonts through MuPDF's font callback.

- **Simulator check with the trimmed build.** The iOS 26.5 simulator development build, linked against the trimmed 34 MB framework, returned the same results through the real adapter as before trimming: valid PDF 2 pages with the expected fingerprint, encrypted `passwordRequired`, truncated `corrupt`, an immediate cancel `cancelled`, and 8 concurrent inspections all `ok`.

## Provisional budgets

Proposed, for a warm inspection on a recent iPhone-class device. They are **not yet validated on hardware** (see limits):

- Files up to 200 MB: under 250 ms including the fingerprint.
- Documents up to 100,000 pages within that size: under 50 ms beyond hashing.
- Peak memory growth: under 16 MB per inspection.
- No unbounded growth across 1,000 repeated inspections.

## Limits of this evidence

- Measured on a Mac, not an iPhone. An iPhone's SHA-256 throughput and storage speed will differ, so the budgets above are unvalidated until run on the baseline device. The same benchmark can be run on a device build by adding a dev-only harness; this is left for the import ticket (#6), which gives a real screen to drive it from.
- Cold runs keep a warm OS file cache.
- One synthetic document per size; real scans, linearized files, and PDFs with object streams may differ.
- The size figure is for inspection-only use of MuPDF on the host. The app's final size impact must be measured on a Release build once the Reader renders pages.
