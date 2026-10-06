# Implementation plan: PR 24 installed-app CI recovery

## Outcome

The publication action menu stays accessible after rename, and Files handoff waits for dismissal before testing imports.

## Required context read

- [x] Constitution, architecture, requirements, CONTEXT, ADR 0002
- [x] Testing, branching, issue tracker
- [x] Diagnosing bugs, TDD, codebase-design, Expo UI and code-review
- [x] SDK 57 Menu and modifiers references and installed adapter source

## Scope

Fix the two failures in run 37169460873; retain all acceptance assertions, import concurrency and persistence behavior. No dependency or native project changes.

## Seams and tests

The existing agreed installed-app seam is authoritative: `publication-actions.yml` opens a renamed menu by its accessible label, and `favorites.yml` requires Files dismissal and a durable imported row. The recorded CI run is red at both seams. Jest's declared web menu adapter cannot reproduce SwiftUI accessibility, so no shallow mock test will stand in for native acceptance. Native repro takes minutes because it includes Files; use only the affected installed-app flows locally.

## Acceptance criteria

- [x] Renamed menu has its publication-specific native accessibility label and all actions.
- [x] Picker handoff waits for dismissal with bounded retries and still asserts the import outcome.
- [x] Affected Maestro flows, validation and review pass.

## Vertical slices

1. Recorded failing renamed-menu assertion → native SwiftUI label and symbol trigger → installed-app regression.
2. Recorded failing Files-dismissal assertion → bounded dismissal wait after each retry → favorites/import acceptance.

## Validation

- [x] Lint, typecheck, unit, integration, UI and combined validation: 51 unit, 103 integration and 34 UI tests passed; Biome checked 96 files.
- [x] Relevant Maestro flows: publication-actions, favorites and smoke passed on the installed iOS 26.5 simulator (3/3, 4m 19s), using the rebuilt Hermes bundle.
- [x] Standards and Spec review: zero actionable findings in either axis.
- [x] Architecture and testing documentation updated; PR evidence prepared.

Remote CI must rerun on the pushed fix before its status can be considered recovered.

## Rollback and risks

No migration or file changes. iOS presentation uses the same Expo UI module already built; Android retains its menu adapter. Roll back the iOS adapter and helper changes together if native acceptance regresses. MuPDF distribution stays blocked.
