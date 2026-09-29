# Testing Muse

`bun run validate` runs Biome, TypeScript, and all JavaScript test suites. It is the local gate before a feature PR.

Lefthook runs Biome on staged JavaScript, TypeScript, JSON, and CSS before each commit, then runs `bun run validate` before a push. `bun install --frozen-lockfile` installs the hooks. CI runs the same validation once as the remote merge gate; the separate `bun run lint` command remains available for the feature loop.

| Layer | Command | Location | Boundary |
| --- | --- | --- | --- |
| Unit | `bun run test:unit` | `tests/unit/` | Exported domain or utility behavior |
| Integration | `bun run test:integration` | `tests/integration/` | Application and Expo configuration seams |
| Rendered UI | `bun run test:ui` | `tests/ui/` | Visible React Native behavior via React Native Testing Library |
| Installed app | `bun run test:e2e` | `.maestro/` | iOS simulator behavior via Maestro |

Jest uses the SDK 57 `jest-expo` preset. React Native Testing Library 14 uses async `render`, so await the result before querying. Keep assertions on visible content or accessible controls. The UI tests cover shared primitives and the Maestro smoke flow walks the three-tab shell and the Appearance choice; extend them with Library and Reader flows as those screens are built. The Maestro flow has not been run against this shell yet.

## Local iOS E2E

Install Maestro CLI 2.10.0 and Java 17 or newer using the [official Maestro instructions](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli). Then build a standalone simulator app with the local Xcode toolchain:

```bash
bunx expo run:ios --configuration Release --device generic --output ./build
xcrun simctl install booted ./build/Muse.app
bun run test:e2e
```

Boot an iOS simulator before installing the app. The GitHub `iOS Maestro E2E` workflow performs the same build and flow on feature PRs to `develop`, using Xcode 26.6 and an iOS 26.5 simulator. It downloads Maestro 2.10.0 with a checked SHA-256. A local Xcode 27 build passed this flow on iOS 26.5; the iOS 27 simulator timed out starting Maestro's XCUITest driver, so do not switch CI to iOS 27 without revalidating it. Routine feature work uses local Xcode and GitHub Actions; EAS development and preview builds are available when a beta distribution needs them.

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
