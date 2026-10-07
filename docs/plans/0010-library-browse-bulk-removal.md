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

GitHub issues #6 and #10 are closed. The feature branch starts from fetched develop `051475a`. PR #27 is open against develop, linked to #8 and #11. Using the already signed-in personal owner account, Project status/channel/sprint were verified as In Review, Beta (develop), Sprint 1. Issues remain open until merge. The original head passed GitHub branch-policy, validation and iOS Maestro CI.

## PR review follow-up
Codex review on PR #27 identified missing cancellation and repeated sort-key normalization. Add optional AbortSignal to the owner-approved PublicationLibrary bulk seam, finish the current durable removal, then stop before the next publication. The count-aware dialog exposes Stop removal while pending and aborts on unmount. Unprocessed selections remain available for retry. Precompute normalized title/date keys once per matching publication. Regression tests cover already-aborted signals, cancellation during a commit, Stop removal and dialog disposal. `bun run lint` and `bun run validate` pass: 73 unit, 109 integration and 42 UI tests (224 total).

Follow-up Standards and Spec reviews found no actionable findings. Retry-after-stop is asserted through the rendered screen. The current production JS bundle passed `library-browse-removal.yml` on the same disposable iOS 26.5 simulator; diagnostics: `.cache/library-e2e/maestro-review/`. Cancellation itself is covered with deterministic deferred-removal integration/UI tests, since fixture removals complete too quickly for a reliable native Stop tap.
