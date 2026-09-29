# Dependency decisions

This record covers packages introduced for the Muse foundation. Versions are resolved in `bun.lock`; Expo packages were installed with `bunx expo install` against SDK 57.

| Package | Need | Compatibility evidence | License review |
| --- | --- | --- | --- |
| `expo-dev-client` `~57.0.19` | Run native MuPDF and other custom modules without Expo Go. | Selected by Expo CLI for SDK 57; Expo Doctor validates the installed graph. | MIT; acceptable. |
| `expo-document-picker` `~57.0.2` | First import slice: choose PDFs from the system document provider. | SDK 57 versioned API and Expo CLI resolution. | MIT; acceptable. |
| `expo-file-system` `~57.0.7` | Copy selected PDFs into app-owned storage and manage disposable render cache. | SDK 57 versioned API and Expo CLI resolution. | MIT; acceptable. |
| `expo-sqlite` `~57.0.3` | Durable library, bookmark, reading-position, and cache-index metadata. | SDK 57 versioned API and Expo CLI resolution. | MIT; acceptable. |
| `expo-build-properties` `~57.0.22` | Enable SDK 57 UIKit scene lifecycle support required by Xcode 27. | Expo documents `ios.enableSceneSupport` for SDK 57.0.23+; app uses 57.0.25. | MIT; acceptable. |
| `jest` `~29.7.0` | Execute deterministic unit and integration tests. | Required major for the SDK 57 `jest-expo` preset. | MIT; acceptable. |
| `jest-expo` `~57.0.5` | Transform Expo/React Native code and assets for Jest. | SDK 57 version selected by Expo CLI. | MIT; acceptable. |
| `@types/jest` `29.5.14` | Type Jest globals under TypeScript strict mode. | Matches Jest 29; typecheck passes. | MIT; acceptable. |
| `@testing-library/react-native` `^14.0.1` | Test user-observable React Native behavior as UI slices are added. | Declares React 19 and React Native 0.78+ peers; app uses React 19.2 and RN 0.86. | MIT; acceptable. |

`react-native-boost` was evaluated but removed from the foundation: no measured bottleneck justified a global Metro integration yet. Performance dependencies require a benchmark-backed feature plan.

CI actions are pinned to immutable commits: `actions/checkout` v4.2.2 at `11bd71901bbe5b1630ceea73d27597364c9af683` (MIT) and `oven-sh/setup-bun` v2.2.0 at `0c5077e51419868618aeaa5fe8019c62421857d6` (MIT).

Maestro CLI 2.10.0 is pinned in GitHub Actions with the release ZIP SHA-256 `29b675e10cc12080e445e9bfb2e2b4e4dfb9c0f2e30d5884120d258b5e1cd991`. It runs outside the app dependency graph against an installed simulator build. Its source is Apache-2.0 licensed; no Maestro runtime package is shipped in Muse.
