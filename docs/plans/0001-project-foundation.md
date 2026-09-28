# Project foundation implementation plan

## Goal

Establish the documented architecture, validation loop, SDK-compatible native dependencies, and CI foundations required before Muse feature work begins. Add the SDK 57 scene lifecycle configuration required when building with Xcode 27.

## Scope

- Replace generic agent guidance with Muse-specific delivery rules.
- Record requirements, architecture, constitution, domain language, and initial ADRs.
- Configure Biome, Jest, GitHub Actions, and EAS validation.
- Install the Expo modules selected for the first import-and-read vertical slice.
- Configure Uniwind and the Xcode 27 scene lifecycle through CNG-safe config plugins.
- Do not implement the MuPDF renderer, publication import UI, storage schema, or reader UI.

## Behavior and seams

1. Expo resolves the checked-in app configuration without errors.
2. The resolved plugin configuration enables the UIKit scene lifecycle on iOS.
3. Unit and integration suites contain real tests and fail if this required configuration is removed.
4. Lint, typecheck, both test suites, Expo Doctor, and workflow validation pass.

## Implementation sequence

1. Write config tests that express the required SDK and scene-support behavior.
2. Add SDK-resolved Expo dependencies and configure plugins in `app.json`.
3. Add the validation scripts and CI/EAS workflows.
4. Write the project governance and architecture documents.
5. Run the complete validation loop and review the diff against the constitution.

## Risks and controls

- MuPDF licensing is unresolved: distribution remains blocked by ADR 0001.
- Native changes can drift: keep them in app config/local Expo modules and verify the resolved config.
- Dependencies can become incompatible: install Expo modules through `expo install`, retain `bun.lock`, and run Expo Doctor.
- Extremely large PDFs can exhaust resources: renderer work must begin with bounded native scheduling and measured fixtures.

## Completion evidence

Record final command results in the PR description. A green no-test suite is not accepted.
