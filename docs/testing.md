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

Jest uses the SDK 57 `jest-expo` preset. React Native Testing Library 14 uses async `render`, so await the result before querying. Keep assertions on visible content or accessible controls. The UI tests cover shared primitives and Library import states. Maestro's smoke flow walks the three-tab shell and Appearance; `import-one.yml` selects the committed two-page PDF through Files, checks its accessible row, and checks persistence after relaunch and native Search title filtering/clearing.

## Local iOS E2E

Install Maestro CLI 2.10.0 and Java 17 or newer using the [official Maestro instructions](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli). Build the pinned MuPDF framework for this local test build, then target a booted arm64 iOS simulator. The temporary Xcode configuration is necessary because the framework has an arm64 simulator slice while Xcode's Release build otherwise asks for arm64 and x86_64:

```bash
scripts/build-mupdf.sh
printf 'ARCHS = arm64\n' > /tmp/muse-sim-arm64.xcconfig
XCODE_XCCONFIG_FILE=/tmp/muse-sim-arm64.xcconfig scripts/build-ios-e2e.sh "$PWD/build"
xcrun simctl install <SIMULATOR_UDID> ./build/Muse.app
scripts/seed-ios-files-fixture.sh <SIMULATOR_UDID>
maestro test --udid <SIMULATOR_UDID> --exclude-tags=large .maestro
scripts/seed-ios-files-fixture.sh <SIMULATOR_UDID> --large
maestro test --udid <SIMULATOR_UDID> --include-tags=large .maestro
```

The seeding script puts four fixtures in the simulator's On My iPhone Files provider: `Muse Import Fixture.pdf` (the valid two-page PDF), `Muse Duplicate Fixture.pdf` (identical bytes), `Muse Damaged Fixture.pdf`, and, with `--large`, a generated 143 MB `Muse Large Fixture.pdf` that only the large-import flow (`import-large.yml`, tagged `large`) uses, because a slow Files provider stays busy with it; it does not expose Muse's private document directory. The GitHub `iOS Maestro E2E` workflow performs the same build and runs all four top-level flows, seeding the large fixture only for the large-import flow on feature PRs to `develop`, using Xcode 26.6 and an iOS 26.5 simulator. It downloads Maestro 2.10.0 with a checked SHA-256. Local Xcode 27 builds have validated import on iOS 26.5, including a fresh simulator; the iOS 27 simulator timed out starting Maestro's XCUITest driver, so do not switch CI to iOS 27 without revalidating it. Routine feature work uses local Xcode and GitHub Actions; EAS development and preview builds are available when a beta distribution needs them.

## Local import benchmark

On a dedicated booted arm64 simulator with MuPDF already built, run `scripts/bench-publication-import.sh <SIMULATOR_UDID>`. It temporarily replaces the Library route with the harness in `tests/performance/`, builds a Release app, restores the source route on exit, and measures the production Library, FileSystem, renderer, and SQLite adapters. The harness clears Library records and owned files between cases, so use a disposable simulator. It writes stage timings and sampled process RSS to `.cache/import-benchmark/`; generated PDFs and binaries remain ignored. Rebuild the normal app before running Maestro. Method, results, and hardware limits are in [publication import performance](performance/0002-publication-import.md).

## CI caching and recovery

The `CI` validate job caches Bun's package cache. The `iOS Maestro E2E` job caches Bun packages, CocoaPods downloads, and a `ccache` of C++ compilation. Cache keys hash only native inputs (`bun.lock`, `app.json`, `eas.json`, `modules/`, `plugins/`), so JavaScript-only changes reuse the exact cache and only re-run the JS bundle. `ccache` is content-addressed, so a partial restore never produces a wrong binary.

The workflow also runs on pushes to `develop`. GitHub only lets a PR read caches saved on its base branch, so those runs keep the cache warm for every feature PR.

### Where the build time goes

In a representative 1,427 s build step (run 36826406579), `Compiling` took 780 s: `RNReanimated` 504 s, `RNScreens` 95 s, `RNWorklets` 29 s, `RNGestureHandler` 25 s. This is C++ from source that ccache can serve; React Native core and Expo modules are prebuilt. The build step was 852 to 1,568 s on every run so far, because ccache never served a compile.

### Why ccache did nothing, and the fix

Two independent problems, reproduced locally with ccache 4.14.1:

1. React Native points `CC` at `ccache-clang.sh`, which runs `$CCACHE_BINARY clang`. `CCACHE_BINARY` is a build setting, and Xcode does not export build settings into compile tasks (a logging wrapper saw it unset, while ambient variables such as `CCACHE_DIR` did arrive). The wrapper silently ran plain `clang`. `scripts/ci-ccache-env.sh` now exports the resolved binary in the job environment.
2. Even with the binary found, ccache rejected every call (187 of 187, "unsupported compiler option") because Xcode passes `-ivfsoverlay` and ccache needs `CCACHE_SLOPPINESS=ivfsoverlay` to cache it. The same script adds it, and turns on depend mode (`CCACHE_DEPEND=true`) because the `modules` sloppiness otherwise stops ccache from noticing changed module headers.

Local measurement for the `RNReanimated` scheme (Release, arm64 simulator, a fresh build tree at the same DerivedData path each time, using the committed `scripts/ci-ccache-env.sh` output):

| Xcode | Mode | Cold | Warm | Warm hits |
| --- | --- | ---: | ---: | ---: |
| 26.6 (17F113, the version on `macos-26` runners) | direct | 53 s | 6 s | 187 of 187 |
| 26.6 | depend (committed) | 67 s | 5 s | 187 of 187 |
| 27.0 | direct | 153 s | 13 s | 187 of 187 |

The warm run needs the same DerivedData path as the cold one because the path is part of each compile command; a different path gave 0 hits. CI uses one checkout path, so it should match. These numbers come from one Mac, not from a GitHub runner (whose cold compile was about 500 s for the same pod), so the speed-up on CI is unproven until a run completes.

Alternatives not taken: Xcode's built-in compilation caching (`COMPILATION_CACHE_ENABLE_CACHING`) measured 100% hits in a separate probe and needs no extra tool, but it conflicts with React Native's ccache wrapper, has not been run on a runner, and its cache size for the whole app is unknown. Revisit it if the ccache hit rate on CI disappoints.

The `Report build time and ccache statistics` step writes the build duration and ccache hits and misses to the job summary and emits a warning when ccache served nothing, so a regression is visible without reading logs.

### Behavior

`scripts/ci-plan-build.sh` decides what a run needs and is unit tested (`tests/unit/ci-plan-build.test.ts`); `scripts/ci-ccache-env.sh` is tested in `tests/unit/ci-ccache-env.test.ts`.

| Situation | Behavior |
| --- | --- |
| Docs-only pull request or push (`docs/` and `*.md`) | The macOS build and Maestro steps are skipped; the job still passes. |
| Manual run, or a change list that cannot be determined | Always builds. |
| Native inputs changed, or more than 150 files changed | No fallback cache is restored; the build starts clean and saves a new cache. |
| Cached build fails | The cache generation is deleted, local build state is wiped, and the build retries once from scratch. |
| Corrupt Bun cache | `bun pm cache rm` runs and `bun install --frozen-lockfile` retries once. |
| Manual reset | Run the workflow with `clean_cache`, or bump the repository variable `NATIVE_CACHE_VERSION` to invalidate every cache. |

The simulator is created and booted before the build and awaited after it, so the 2 to 3 minute boot overlaps the compile. On a three-core runner this may slow the compile slightly; compare the job summary with earlier runs.

Not yet verified on GitHub: the recovery path, `clean_cache`, the push-event skip, ccache hits on a runner, and the simulator overlap. Record real before and after timings on #14 from the first runs. The MuPDF build (about 185 s per run) is deliberately not cached: ADR 0001 limits where MuPDF binaries may exist, and that needs an explicit decision.

## Native inspection benchmark

`bun run bench:native` (macOS only) generates large fixtures under `.cache/fixtures` and prints latency and memory per fixture as a markdown table. Results are recorded in `docs/performance/`. The MuPDF build and the tests in `tests/integration/mupdf-gate.test.ts` keep MuPDF out of preview and production builds; see ADR 0001.

## Multiple-publication import

`tests/integration/publication-batch-import.test.ts` exercises `PublicationLibrary.importMany()` with in-memory adapters: mixed outcomes, a two-file resource bound, progress, duplicate admission during a pending write, cancellation, cleanup, recovery after a write failure, overlapping requests and picker failures. `tests/ui/library-import.test.tsx` covers toast outcomes (imported, duplicate, mixed, failed, picker failure, dismissed Files), the absence of progress, results and Cancel UI, toast dismissal, and abort on unmount without a late toast, through `LibraryScreen`. The same agreed seam also covers displayed-title filtering, no-results feedback, clearing and fallback search/cancel with disabled Edit.

The Files fixtures and commands are listed in [Local iOS E2E](#local-ios-e2e). The installed-app flows verify one-file/relaunch/duplicate admission, the one-toast summary of a mixed batch, a 143 MB import completing and persisting after relaunch, and navigation smoke. A toast disappears after 5 seconds (8 for errors), and a slow CI runner can poll less often than that, so flows assert durable publication rows wherever they can. Where a toast is the only trace (the duplicate outcome in `import-one`), use `helpers/open-selection-toast.yml`, which taps Open and waits for the toast at once: `helpers/open-selection.yml` spends about 8 seconds settling the picker, longer than a toast lasts. The toast's text is exposed through its accessibility label, so Maestro can match it. Picker helpers verify each selected item before opening and require dismissal before result assertions. Helpers live in `.maestro/helpers/`; default directory discovery runs only top-level flows ([Maestro discovery documentation](https://docs.maestro.dev/maestro-flows/workspace-management/test-discovery-and-tags)).

Use `scripts/build-ios-e2e.sh` for installed-app flows. It builds the real UI, picker, files, SQLite and MuPDF, installs one shared Library for the Library and Search routes, and records native copy stage timings. The build script restores the normal route on every exit. The UI has no Cancel control, so cancellation is covered by integration tests (queued work, active copy, inspection, and abort on unmount) and the native select/copy/cancel/release tests.

The iOS picker opens selections in place; only active Library workers copy provider bytes into staging. Import flows use `extendedWaitUntil` for picker handoff and completion. CI runs all top-level flows and seeds the large fixture only for the large import. Its 75-minute job budget leaves room for the full suite after the previous run spent 47 minutes in setup/build; per-flow outcome assertions remain required. On failure, CI prints the screen hierarchy and Muse log. ADR 0001's integration gate forbids artifact uploads from MuPDF build workflows; reproduce failures locally for screenshots and full debug output.

On a disposable simulator, `scripts/bench-publication-batch.sh <BOOTED_SIMULATOR_UDID>` compares sequential imports with the two-worker batch using the same two-page, 143 MB scan and 100,000-page fixtures. It temporarily installs the benchmark route, restores the source on exit, and verifies three durable rows/files with no staging files after each run. Its final probe aborts during the real large-file streaming copy, checks active/queued cancellation and preserves the completed small publication with no staging leftovers. Rebuild the normal app afterward. Stage-level single-file measurements remain in `scripts/bench-publication-import.sh`. Method, per-run results and hardware limits are recorded in [batch import performance](performance/0003-publication-batch-import.md).

`scripts/test-publication-sources.sh` runs the native select/copy/cancel/release seam against real temporary files on macOS, with one Swift compiler worker. It checks that selection creates no copies, successful copying preserves bytes, oversized sources fail before output, released sources cannot be reused, active cancellation removes partial files before settling, and a third simultaneous copy is rejected. The iOS CI job runs this check before building the app. `tests/integration/native-publication-import.test.ts` covers opaque source ownership and abort mapping across the JavaScript bridge. Installed Files flows additionally exercise iOS provider permissions and module autolinking.

The E2E test route also records completed native copy stages in `Documents/e2e-provider-copy.json`. Reporting is nonthrowing so profiling cannot lose staging ownership. `python3 scripts/profile-publication-provider-copy.py <UDID> .maestro/import-large.yml <OUTPUT_JSON>` runs the installed large-import flow and samples only the disposable simulator's Muse process; its output rejects missing measurements. Build with `scripts/build-ios-e2e.sh` and seed `--large` first. This is optional performance profiling, separate from normal flow assertions; the stage timestamps cover only the copy. The recorded measurements in `docs/performance/` were taken earlier with a cancellation flow and its barrier. Method, before/after data and sampling limitations are in the batch performance report.

## Native tab bar and header glass

Tab minimization has no automated assertion. On an iOS 26 simulator, give the Library more rows than fit on screen (the Files fixtures de-duplicate to one publication, so add disposable rows to the simulator's `muse-library.db` while the app is closed and remove them afterwards). Scrolling down collapses the bar to the selected-tab and Search circles; a slow, continuous scroll up restores it. Fast synthetic flicks may not re-expand the bar, so use a manual touch path. Do not tap the top screen edge to scroll to the top: the simulator treats it as a system gesture and quits the app. Also check the Search tab (bottom search pill, clear and close controls, title filtering), the glass **+** and **Edit** header buttons in light and dark, and maximum Dynamic Type. `tests/unit/theme-tokens.test.ts` enforces 4.5:1 for `accentText` on canvas and surface in both palettes, and `tests/ui/library-import.test.tsx` covers the shared app Library instance used by both routes.

`LegendList` renders rows only after it measures a layout, which React Native Testing Library never provides, so `jest.setup.ts` replaces `@legendapp/list/react-native` with a shim that keeps its public contract (data, `renderItem`, header, empty state, footer). Rendered tests therefore verify each screen's output, not the virtualizer; scrolling, recycling and tab minimization are verified only on the simulator.

`src/theme/glass-capability.ts` is a declared seam, as `docs/architecture.md` describes: rendered UI tests fake `detectTabBarKind` to exercise the complete non-glass design, because Jest otherwise reports glass. The glass branches (tab bar, header actions, toast) are therefore verified only on an iOS 26 simulator.
