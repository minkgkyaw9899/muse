# Implementation plan: multiple publication import

Ticket: #7. Parent spec: #3. Branch: `codex/issue-7-multiple-imports` from `develop` (`4321664`).

## Outcome

Select several PDFs in Files, follow completed-file progress, cancel remaining work, and retain an independent result for every selection. Successful publications remain durable even when another file fails or the batch is cancelled.

## Required context read

- [x] Constitution, architecture, requirements, CONTEXT.md, ADRs 0001 and 0002.
- [x] Branching, issue-tracker, testing, and implementation-plan template.
- [x] Implement, codebase-design, TDD, code-review and Expo UI skills.
- [x] Pinned Expo SDK 57 and DocumentPicker documentation.

## Scope

### Included

- Multi-select picker and Library batch import, with a fixed limit of two active files (copy/inspection/commit/cleanup included).
- Results identified by selection index and original filename; completion count and individual outcomes delivered incrementally and retained in selection order.
- Stable fingerprint admission, serialized duplicate lookup/promotion/commit within this Library, and SQLite uniqueness protection for external races.
- Batch cancellation stops queued imports, cancels active inspection/copy, releases every picker cache copy, and preserves committed publications.
- Virtualized result rows, accessible progress and Cancel control, existing Library rows retained.

### Excluded

- Reader, Library organization/removal, per-file retry, byte-level progress, new database schema, native renderer changes, dependency additions, and MuPDF distribution.

## Seams and tests

Confirmed by the owner on 2026-10-01, before the first new test: public `PublicationLibrary` with in-memory picker/files/repository/renderer adapters, and rendered `LibraryScreen` through accessible controls and visible text. The existing single-file seam remains supported for benchmarks and existing callers.

- Integration: batch outcomes, bounded work, duplicate races, cancellation, cleanup, persistence after relaunch, safe picker errors.
- Rendered UI: progress, mixed per-file results, cancellation preserving successful rows, stale completion after unmount, accessible announcements.
- Installed app: Files multiple selection, mixed valid/corrupt/duplicate outcomes, relaunch and cleanup; existing navigation smoke.

## Acceptance criteria

- [x] Multiple selections run with at most two active files and can be cancelled.
- [x] Every selection retains an imported, duplicate, cancelled, or actionable failure result; progress counts terminal results.
- [x] Equal fingerprints produce one visible durable publication.
- [x] Failed and cancelled imports release temporary and uncommitted owned files; successful imports survive cancellation/relaunch.
- [x] VoiceOver, Dynamic Type, 44-point controls, semantic tokens and reduced-motion behavior apply.
- [x] Named simulator fixture measurements compare single and batched import; no per-page allocation or physical-device guarantee claimed.

## Vertical slices

1. One failing Library test for mixed results → reuse single-file admission in a batch.
2. One failing bounded-work/cancellation test → fixed worker scheduling and cleanup.
3. One failing duplicate-race test → serialize durable admission, preserve existing external-race recovery.
4. One failing rendered test → progress and independent result list; then cancellation and announcements.
5. Multi-select production picker, installed-app flows and fixture measurements.

## Validation

- [x] Focused tests and regular typecheck.
- [x] `bun run lint`, `bun run typecheck`, unit, integration and UI suites.
- [x] Relevant Maestro flows on the installed Release test build: 4/4 passed on iOS 26.5 with Maestro 2.10.0 on 2026-10-02. Maximum Dynamic Type cancellation, result scrolling and relaunch also passed after Files selection.
- [x] `bun run validate`.
- [x] Two-axis code-review against base `4321664`; no remaining actionable Standards or Spec findings. Documentation updated.

## Rollback and risks

No schema or native-interface migration. SQLite unique fingerprints remain the final duplicate guard. Keep copy buffers and worker count fixed to contain aggregate memory; system picker cache copies remain outside Muse's copy scheduling. Completion is reported after cleanup. Cancellation is cooperative and does not undo durable inserts. Observer callbacks must not change import outcomes. Startup reconciliation is run once before work, never between active imports. Preserve source files on uncertain database commit, as in the single-file implementation. MuPDF stays local-build only under ADR 0001.

## Session resource constraint

At the owner's request, commands run at low scheduling priority (`nice -n 15`), native/JavaScript build workers are capped at five of this Mac's ten cores, and heavy tasks run one at a time. The extra Darwin background restriction was removed after it severely stalled compilation; low priority and the worker cap remain. Review axes run sequentially. These are session controls, not product settings.

## Native accessibility follow-up

The installed maximum Dynamic Type check exposed progress wrapping into a narrow column beside Cancel. Before changing production layout, add an installed-UI assertion for a readable progress width across supported iPhone sizes. Put Cancel below the progress line, then repeat the native check at maximum text size and retain the longer Cancelling label without constraining progress width. Verify cancellation, result scrolling and relaunch at that size.

The E2E test build holds the real copied large file until cancellation so every CI flow remains required. A separate production-adapter benchmark probe aborts when the small file commits, verifying cancellation while the real large streaming copy is still active and cleanup of both active/queued selections.

## Final local evidence (2026-10-02)

`bun run lint`, `bun run typecheck`, `bun run test:unit` (47), `bun run test:integration` (77), `bun run test:ui` (12), and `bun run validate` passed sequentially. The installed width assertion failed with the inline Cancel layout and passed after moving Cancel below progress. Rendered tests cover accessible controls and completion announcements; the maximum Dynamic Type check covers the app after Files selection. The normal Release route was restored, rebuilt successfully, and passed navigation smoke. The disposable simulator was shut down afterward.

Immediate installed storage checks after mixed import and cancellation each found one durable two-page publication, one owned PDF, zero staging PDFs and zero picker cache files. The production streaming-copy probe additionally verified active/queued cancellation with the completed publication preserved. Three sequential and three batch runs, including a 100,000-page PDF, are recorded with sampled RSS and measurement limits in [the performance report](../performance/0003-publication-batch-import.md).
