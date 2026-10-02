# Multiple-publication import performance (ticket #7)

Measured on 2026-10-02 with the real `PublicationLibrary`, Expo FileSystem, MuPDF and SQLite adapters. The corpus combines `valid-2-pages.pdf` (269 bytes, 2 pages), `scan-100p-150mb.pdf` (150,031,623 bytes, 100 pages), and `pages-100k.pdf` (10,480,028 bytes, 100,000 pages). Their SHA-256 values and single-file stage measurements are in [0002-publication-import.md](0002-publication-import.md).

Environment: Apple M4 host, macOS 27, Xcode 27, iPhone 17 Pro simulator on iOS 26.5, Release arm64, MuPDF 1.28.5. Local build workers were capped at five and commands used `nice -n 15`; heavy tasks ran sequentially to keep the owner's laptop available for work. Simulator execution remains subject to host scheduling and other applications.

## Method and results

Run `scripts/bench-publication-batch.sh <BOOTED_SIMULATOR_UDID>` on a disposable simulator. It temporarily installs a benchmark route and restores its source on exit. The harness initializes SQLite before timing, clears rows and reconciles owned files between cases, then imports the three fixtures either sequentially with `importOne()` or with the two-worker `importMany()`. Every run verifies three durable rows, three owned PDFs and no staging files; reported page counts are 2, 100 and 100,000. Inputs are seeded in private storage, so system picker handoff and cache-copy latency are excluded. Rebuild the normal app afterward.

| Mode | Runs | Median total (ms) | Observed maximum active files | Maximum sampled RSS (MiB) | Maximum sampled growth (MiB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sequential | 3 | 10,342.3 | 1 | 441.3 | 155.8 |
| Batch | 3 | 9,639.7 | 2 | 378.9 | 105.4 |

[Raw per-run results](publication-batch-results.json) preserve timing, bytes, pages, active-file counts and RSS samples' aggregates. Total timing uses `performance.now()`. Host `ps` samples process RSS every 20 ms plus subprocess overhead, from start through 50 ms after completion; growth is peak minus the preceding baseline. Brief peaks can be missed.

Sequential runs precede batch runs in the same process. The first sequential run starts with a smaller runtime heap and grows by 155.8 MiB; later runs retain much of that allocation. The warmed batch's 105.4 MiB growth cannot establish a smaller cold-start allocation budget. OS file caches are not purged, RSS includes Hermes/native/runtime allocations, and this corpus contains one large byte-size input. These measurements do not establish worst-case memory for two simultaneous near-cap files, an iPhone latency or memory guarantee, or reader rendering performance.

The implementation keeps copy chunks at 256 KiB with a yield between chunks and bounds active import work, including cleanup, at two files. It does not allocate state per PDF page. This benchmark verifies those active-file counts with a 100,000-page fixture; physical-device profiling and adversarial/near-cap inputs remain future performance work.

## Real-copy cancellation probe

After the timed runs, the harness clears its test records/files and starts the same three selections. The small publication's settled success callback aborts the batch. Instrumentation verifies the large real `FileStore.stage()` call has started and has not settled at that point. The installed production adapters return two cancelled selections (active large copy and queued 100,000-page file), preserve one durable publication/owned file, and leave no staging files. The raw report records these assertions under `cancellationProbe`. This complements the Maestro test build's deterministic barrier after staging; the probe uses the normal streaming-copy implementation without that barrier. System picker cache disposal is verified separately by installed Files flows and immediate storage checks.
