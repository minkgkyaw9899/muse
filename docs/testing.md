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

Jest uses the SDK 57 `jest-expo` preset. React Native Testing Library 14 uses async `render`, so await the result before querying. Keep assertions on visible content or accessible controls. The initial UI and Maestro flows exercise the starter app only to prove the harness; replace them with Library and Reader flows as those screens are built.

## Local iOS E2E

Install Maestro CLI 2.10.0 and Java 17 or newer using the [official Maestro instructions](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli). Then build a standalone simulator app with the local Xcode toolchain:

```bash
bunx expo run:ios --configuration Release --device generic --output ./build
xcrun simctl install booted ./build/Muse.app
bun run test:e2e
```

Boot an iOS simulator before installing the app. The GitHub `iOS Maestro E2E` workflow performs the same build and flow on feature PRs to `develop`, using Xcode 26.6 and an iOS 26.5 simulator. It downloads Maestro 2.10.0 with a checked SHA-256. A local Xcode 27 build passed this flow on iOS 26.5; the iOS 27 simulator timed out starting Maestro's XCUITest driver, so do not switch CI to iOS 27 without revalidating it. Routine feature work uses local Xcode and GitHub Actions; EAS development and preview builds are available when a beta distribution needs them.
