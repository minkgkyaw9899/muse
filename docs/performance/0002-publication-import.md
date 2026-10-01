# Publication import performance (ticket #6)

The Library import adds a picker handoff, an owned-file copy, and a SQLite insert around the native inspection measured in [0001-pdf-inspection.md](0001-pdf-inspection.md). This note records what was verified for the first one-file slice and what still needs a baseline iPhone measurement.

## Installed-app fixture

| Field | Value |
| --- | --- |
| Date and environment | 2026-09-30; Apple M4 host, Xcode 27, iOS 26.5 iPhone 17 Pro simulator, Release configuration with arm64 MuPDF 1.28.5 |
| File | `tests/fixtures/pdf/valid-2-pages.pdf`, selected from On My iPhone as `Muse Import Fixture.pdf` |
| Size and SHA-256 | 269 bytes; `fe29a275f5a0f608267c1e1b7072b840d912b6f155ab01bf9a16cd49894cb8fa` |
| State | Fresh simulator, empty Library and cold SQLite schema |
| Outcome | Picker selection, copy, native inspection, SQLite insert, two-page Library row, and relaunch persistence all passed in Maestro |

Maestro's command durations include XCTest accessibility waits and UI idle time, so they are not stage latencies. The separate installed-app benchmark below measures the production adapters without those waits.

## Full-import benchmark

Run `scripts/bench-publication-import.sh <BOOTED_SIMULATOR_UDID>` on a disposable simulator after building MuPDF. The script temporarily installs a benchmark route, restores its source on exit, and leaves the benchmark binary installed until the normal app is rebuilt. The harness uses the real `PublicationLibrary`, Expo FileSystem, MuPDF, and SQLite adapters. It imports each fixture three times, clearing rows and owned files between runs, and verifies one durable row, one owned file, and no staging files after every import. Fixtures are seeded in private storage to make the copy reproducible; system picker handoff/cache-copy latency is excluded.

Environment: Apple M4 host, macOS 27, Xcode 27; iPhone 17 Pro simulator on iOS 26.5; Release arm64, MuPDF 1.28.5; 2026-09-30. The first two-page import is cold in a fresh app process (schema initialized before timing); later runs use the same process. OS file caches are not purged. Copy, inspection, and exclusive SQLite insertion use `performance.now()`. Total includes the other admission/promotion work. Peak RSS is sampled with host `ps` every 20 ms plus subprocess overhead, from import start through 50 ms after completion. RSS growth is sampled peak minus the sample immediately before import; it includes Hermes/native allocations and runtime reclamation. Short-lived peaks can be missed. Raw measurements for every run are in [publication-import-results.json](publication-import-results.json).

| Fixture | Bytes | Pages | Copy median (ms) | Inspect median (ms) | Commit median (ms) | Total median (ms) | Maximum sampled RSS (MiB) | Maximum sampled growth (MiB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| valid-2-pages.pdf | 269 | 2 | 15.8 | 1.8 | 2.2 | 26.9 | 259.3 | 2.4 |
| scan-100p-150mb.pdf | 150,031,623 | 100 | 9,549.9 | 84.3 | 2.7 | 9,641.4 | 257.3 | 27.1 |
| pages-100k.pdf | 10,480,028 | 100,000 | 666.0 | 15.9 | 1.4 | 689.1 | 81.6 | 10.0 |

The first two-page import took 41.2 ms total (copy 21.2, inspection 10.8, commit 2.8). Absolute RSS varies substantially as the simulator reclaims runtime memory; it is not an isolated allocation count for the imported file. No latency or memory budget on a physical iPhone is claimed.

| Fixture | SHA-256 |
| --- | --- |
| valid-2-pages.pdf | `fe29a275f5a0f608267c1e1b7072b840d912b6f155ab01bf9a16cd49894cb8fa` |
| scan-100p-150mb.pdf | `51896b675ac8d16acfa2fc2a06e69dc7daf875c6145d4c998f16232b522f1e6d` |
| pages-100k.pdf | `af0098e30493dea66febbe3a787d24c3601b8ed49d693c38ef619a19c50258fa` |

### Scheduling comparison

The initial implementation yields after every 256 KiB read/write. Measurements showed that timers add about a frame per chunk. Two alternative batch sizes were measured on the same environment and fixtures:

| Copy work per JS turn | 143 MB total median (ms) | 143 MB maximum sampled growth (MiB) | 100k-page total median (ms) |
| --- | ---: | ---: | ---: |
| 256 KiB, retained | 9,641.4 | 27.1 | 689.1 |
| 1 MiB, rejected | 2,481.2 | 86.5 | 191.4 |
| 4 MiB, rejected | 664.9 | 88.6 | 52.9 |

Faster batches increased sampled memory growth. The first slice retains the smaller turn and visible progress/cancellation, prioritizing memory predictability over import throughput. A future optimization should use a native streaming copy with cancellation or measured buffer reuse, then repeat the same comparison on a baseline iPhone. The data does not establish a worst-case memory bound for every file up to the 2 GiB admission cap.

## Resource bounds and larger fixtures

- The picker accepts one file at a time. A single Library instance admits one import at a time.
- The owned-file copy reads 256 KiB per iteration, yields between chunks for cancellation, and refuses inputs beyond 2 GiB. It never allocates an array per page or loads the whole PDF into JavaScript memory.
- The native inspector has the same 2 GiB limit and streams its SHA-256 read. The existing host benchmark measured a 143.1 MB scan at 53.6 ms warm and 2.4 MB peak RSS growth; the 100,000-page synthetic PDF at 5.7 ms warm and 6.6 MB peak RSS growth. These are **inspection-only host results**, not full-import or iPhone results.
- The copy occupies extra app storage until a valid staged file is moved into the publication directory. The picker also creates a temporary app-cache copy; Muse releases it after every selection and clears stale copies at startup. Duplicate, failure, and startup reconciliation paths remove unreferenced owned files.

The next performance pass needs a baseline physical iPhone, stage-level timings and memory profiling for these fixtures, and near-cap/adversarial inputs. Simulator RSS sampling is evidence for this slice's implementation choice, not a hardware memory guarantee.
