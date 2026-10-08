# Muse

Muse is an iOS-first, offline PDF reader focused on responsive navigation through unusually large documents. It uses Expo SDK 57, development builds, a planned local MuPDF native module, Expo Router, Uniwind, React Native Reusables patterns, and Biome.

## Start here

- [Product requirements](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Engineering constitution](docs/constitution.md)
- [Domain language](CONTEXT.md)
- [Dependency decisions](docs/dependencies.md)
- [Implementation plan template](docs/implementation-plan-template.md)
- [Project foundation plan](docs/plans/0001-project-foundation.md)
- [Branch and pull request workflow](docs/branching.md)
- [Testing guide](docs/testing.md)

## Development

Install dependencies and run the complete validation loop:

```bash
bun install --frozen-lockfile
bun run validate
```

Jest runs unit and integration tests; React Native Testing Library runs rendered UI tests. `bun run test:e2e` runs Maestro flows against an installed iOS simulator build. The [GitHub iOS E2E workflow](.github/workflows/e2e-ios.yml) builds the simulator app and runs those flows for pull requests to `develop`.

Muse requires a development build because its PDF renderer contains custom native code. Expo Go is not supported.

```bash
bunx expo run:ios
bunx expo start --dev-client
```

Build and test feature changes locally to preserve the free EAS allowance for production releases. The EAS validation workflow is manual only; GitHub Actions runs routine checks and Maestro on pull requests.

## MuPDF licensing gate

MuPDF is available under the AGPL or a commercial Artifex license. Do not ship or distribute a MuPDF-enabled build until the chosen licensing path and its obligations are accepted and documented in [ADR 0001](docs/adr/0001-mupdf-native-renderer.md).
