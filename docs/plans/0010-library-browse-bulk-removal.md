# Implementation plan: Library browsing and bulk removal (#8, #11)

## Outcome
Browse Recent and All publications, search displayed titles, choose deterministic ordering, and remove an explicitly confirmed visible selection.

## Required context read
Constitution, architecture, requirements, CONTEXT, testing, branching, issue tracker, ADR 0001; implement, TDD, codebase-design, Expo UI and code-review skills. Expo SDK 57 and React Native accessibility references consulted.

## Scope
Recent (at most three opened publications), six sort orders, metadata-only filtering, accessible selection, filtered Select all, count-aware confirmation, per-publication removal outcomes. Reader opening and new persistence schemas are excluded.

## Seams and tests
The owner-approved parent specification #3 declares PublicationLibrary and rendered LibraryScreen as the test seams. Use in-memory storage adapters for integration behavior and the rendered accessible screen for selection, confirmation and failures. Existing remove(id) retains durable cleanup semantics; no new adapter seam.

## Decisions
Default is recently imported, retaining the current collection order. Date reverse orders are oldest imported and oldest opened; never-opened publications sort after opened publications in both opened orders. Equal primary keys use case-insensitive title then stable ID. Search also filters Recent. Changing the filter prunes hidden selections; Select all means all matching results, including virtualized rows beyond the viewport. Confirmation captures IDs so later collection changes cannot broaden removal. Bulk removal is sequential and continues after individual failures, retaining failed selections for retry.

## Vertical slices
1. Failing Library query behavior → filtering, deterministic sorting and Recent.
2. Failing bulk removal behavior → isolated sequential outcomes and cleanup recovery.
3. Failing screen behavior → sort controls, Recent, selection and confirmation.

## Validation
Run targeted tests per slice, lint, typecheck, unit/integration/UI suites and validate. Add relevant Maestro flow and run it on an installed simulator build if tools are available. Review the entire diff against standards and issues #8/#11. Record unavailable validation explicitly.

## Risks and rollback
No schema or native changes. Work scales with publication count, never page count. Existing transactional removal and pending cleanup preserve recovery. Selection is temporary screen state. Reverting UI/query additions retains existing metadata compatibility.

## Review and validation evidence

- [x] Red/green Library query, partial-removal and rendered selection slices.
- [x] `bun run lint`, `bun run typecheck`, unit/integration/UI and `bun run validate`: 73 unit, 108 integration, 40 UI tests; Biome checked 102 files.
- [x] Standards and Spec reviews against `051475ad56e71c44654c0659c3c6ee952d50d7e4`; follow-up review of `e44401f` reports no remaining actionable findings.
- [x] Initial iOS 26.5 `library-browse-removal.yml`: sort controls, no unopened Recent, filtered Search selection/cancellation/removal, hidden-publication preservation across relaunch, two-publication confirmation/removal and durable empty state.
- [x] Final reviewed-bundle regression on iOS 26.5: bulk flow (1m 50s), publication-actions including favorites (2m 17s), and smoke passed. Diagnostics: `.cache/library-e2e/maestro-final/`.

Review corrected disabled expanded sort choices after a loading failure (reproduced red before fixing), stale disabled-Edit documentation, duplicated single/bulk state reconciliation and the fabricated rename callback in bulk confirmation.

Installed-app testing uses a disposable iPhone 17 Pro simulator on iOS 26.5. `expo export:embed --dev false --bytecode` bundles this checkout into a local copy of an existing SDK-57 MuPDF-enabled Release simulator shell; native code/dependencies are unchanged. This validates the current production UI and real file/SQLite/renderer adapters, without claiming a fresh native compilation. An initial cached shell contained the renderer stub and could not import; symbol inspection identified a MuPDF-enabled shell, and the complete flow then passed. Binaries and diagnostics remain ignored in `.cache/library-e2e/` and are not distributed.

GitHub issues #6 and #10 are closed. The feature branch starts from fetched develop `051475a`. Project status updates are unavailable because the CLI token lacks `read:project`; no issue is closed before merge. Work is committed locally; pushing/opening a PR awaits an owner request.
