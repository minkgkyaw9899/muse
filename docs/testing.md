# Testing Muse

`bun run validate` runs Biome, TypeScript, and all JavaScript test suites. It is the local gate before a feature PR.

Lefthook runs Biome on staged JavaScript, TypeScript, JSON, and CSS before each commit, then runs `bun run validate` before a push. `bun install --frozen-lockfile` installs the hooks. CI runs the same validation once as the remote merge gate; the separate `bun run lint` command remains available for the feature loop.

| Layer | Command | Location | Boundary |
| --- | --- | --- | --- |
| Unit | `bun run test:unit` | `tests/unit/` | Exported domain or utility behavior |
| Integration | `bun run test:integration` | `tests/integration/` | Application and Expo configuration seams |
| Rendered UI | `bun run test:ui` | `tests/ui/` | Visible React Native behavior via React Native Testing Library |
| Native host | `bun run test:native` | `tests/native/` | The C inspection wrapper against real MuPDF: plain, AddressSanitizer, UBSan, ThreadSanitizer, and `leaks` (macOS only; not part of `validate`) |
| Installed app | `bun run test:e2e` | `.maestro/` | iOS simulator behavior via Maestro |

Jest uses the SDK 57 `jest-expo` preset. React Native Testing Library 14 uses async `render`, so await the result before querying. Keep assertions on visible content or accessible controls. The UI tests cover shared primitives and Library import states. Maestro's smoke flow walks the three-tab shell and Appearance; `import-one.yml` selects the committed two-page PDF through Files, checks its accessible row, and checks persistence after relaunch.

## Local iOS E2E

Install Maestro CLI 2.10.0 and Java 17 or newer using the [official Maestro instructions](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli). Build the pinned MuPDF framework for this local test build, then target a booted arm64 iOS simulator. The temporary Xcode configuration is necessary because the framework has an arm64 simulator slice while Xcode's Release build otherwise asks for arm64 and x86_64:

```bash
scripts/build-mupdf.sh
printf 'ARCHS = arm64\n' > /tmp/muse-sim-arm64.xcconfig
XCODE_XCCONFIG_FILE=/tmp/muse-sim-arm64.xcconfig bunx expo run:ios --configuration Release --device generic --output ./build
xcrun simctl install <SIMULATOR_UDID> ./build/Muse.app
scripts/seed-ios-files-fixture.sh <SIMULATOR_UDID>
maestro test --udid <SIMULATOR_UDID> .maestro
```

The seeding script puts four fixtures in the simulator's On My iPhone Files provider: `Muse Import Fixture.pdf` (the valid two-page PDF), `Muse Duplicate Fixture.pdf` (identical bytes), `Muse Damaged Fixture.pdf`, and a generated 143 MB `Muse Large Fixture.pdf`; it does not expose Muse's private document directory. The GitHub `iOS Maestro E2E` workflow performs the same build and flows on feature PRs to `develop`, using Xcode 26.6 and an iOS 26.5 simulator. It downloads Maestro 2.10.0 with a checked SHA-256. A local Xcode 27 build passed both flows on iOS 26.5, including import on a fresh simulator; the iOS 27 simulator timed out starting Maestro's XCUITest driver, so do not switch CI to iOS 27 without revalidating it. Routine feature work uses local Xcode and GitHub Actions; EAS development and preview builds are available when a beta distribution needs them.

## Local import benchmark

On a dedicated booted arm64 simulator with MuPDF already built, run `scripts/bench-publication-import.sh <SIMULATOR_UDID>`. It temporarily replaces the Library route with the harness in `tests/performance/`, builds a Release app, restores the source route on exit, and measures the production Library, FileSystem, renderer, and SQLite adapters. The harness clears Library records and owned files between cases, so use a disposable simulator. It writes stage timings and sampled process RSS to `.cache/import-benchmark/`; generated PDFs and binaries remain ignored. Rebuild the normal app before running Maestro. Method, results, and hardware limits are in [publication import performance](performance/0002-publication-import.md).

## CI caching and recovery

The `CI` validate job caches Bun's package cache. The `iOS Maestro E2E` job caches Bun packages, CocoaPods downloads, and a `ccache` of C++ compilation (`USE_CCACHE=1`, which the generated Podfile honors). Cache keys hash only native inputs (`bun.lock`, `app.json`, `eas.json`, `modules/`, `plugins/`), so JavaScript-only changes reuse the exact cache and only re-run the JS bundle. `ccache` is content-addressed, so a partial restore never produces a wrong binary.

The workflow also runs on pushes to `develop`. GitHub only lets a PR read caches saved on its base branch, so those runs keep the cache warm for every feature PR.

| Situation | Behavior |
| --- | --- |
| Docs-only PR (`docs/` and `*.md`) | The macOS build and Maestro steps are skipped; the job still passes. |
| Native inputs changed, or more than 150 files changed | No fallback cache is restored; the build starts clean and saves a new cache. |
| Cached build fails | The cache generation is deleted, local build state is wiped, and the build retries once from scratch. |
| Corrupt Bun cache | `bun pm cache rm` runs and `bun install --frozen-lockfile` retries once. |
| Manual reset | Run the workflow with `clean_cache`, or bump the repository variable `NATIVE_CACHE_VERSION` to invalidate every cache. |

These changes were validated for YAML syntax only. Measure the first runs on GitHub (compare the `ccache statistics` step and total job time before and after) before treating the speed-up as proven.

## Native inspection benchmark

`bun run bench:native` (macOS only) generates large fixtures under `.cache/fixtures` and prints latency and memory per fixture as a markdown table. Results are recorded in `docs/performance/`. The MuPDF build and the tests in `tests/integration/mupdf-gate.test.ts` keep MuPDF out of preview and production builds; see ADR 0001.

## Multiple-publication import

`tests/integration/publication-batch-import.test.ts` exercises `PublicationLibrary.importMany()` with in-memory adapters: mixed outcomes, a two-file resource bound, progress, duplicate admission during a pending write, cancellation, cleanup, recovery after a write failure, overlapping requests and picker failures. `tests/ui/library-import.test.tsx` covers progress, independent results, cancellation preserving completed rows, and stale completion after unmount through `LibraryScreen`.

`scripts/seed-ios-files-fixture.sh <SIMULATOR_UDID>` seeds a valid two-page PDF, an identical PDF under another filename, a damaged PDF, and a generated 143 MB scan into On My iPhone. Maestro's `import-one.yml` verifies one selection and relaunch/duplicate admission; `import-multiple.yml` selects all three and verifies mixed per-file results and the durable publication after relaunch. `import-cancel.yml` cancels a large copy after its small companion commits, then verifies the cancelled result and the companion after relaunch. Navigation smoke remains applicable.

On a disposable simulator, `scripts/bench-publication-batch.sh <BOOTED_SIMULATOR_UDID>` compares sequential imports with the two-worker batch using the same two-page, 143 MB scan and 100,000-page fixtures. It temporarily installs the benchmark route, restores the source on exit, and verifies three durable rows/files with no staging files after each run. Rebuild the normal app afterward. Stage-level single-file measurements remain in `scripts/bench-publication-import.sh`. Batch latency and RSS results are not yet recorded in `docs/performance/`; make no performance claim for batch import until they are.
