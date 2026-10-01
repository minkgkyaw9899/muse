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

- [ ] Multiple selections run with at most two active files and can be cancelled.
- [ ] Every selection retains an imported, duplicate, cancelled, or actionable failure result; progress counts terminal results.
- [ ] Equal fingerprints produce one visible durable publication.
- [ ] Failed and cancelled imports release temporary and uncommitted owned files; successful imports survive cancellation/relaunch.
- [ ] VoiceOver, Dynamic Type, 44-point controls, semantic tokens and reduced-motion behavior apply.
- [ ] Named simulator fixture measurements compare single and batched import; no per-page allocation or physical-device guarantee claimed.

## Vertical slices

1. One failing Library test for mixed results → reuse single-file admission in a batch.
2. One failing bounded-work/cancellation test → fixed worker scheduling and cleanup.
3. One failing duplicate-race test → serialize durable admission, preserve existing external-race recovery.
4. One failing rendered test → progress and independent result list; then cancellation and announcements.
5. Multi-select production picker, installed-app flows and fixture measurements.

## Validation

- [x] Focused tests and regular typecheck.
- [x] `bun run lint`, `bun run typecheck`, unit, integration and UI suites.
- [x] Relevant Maestro flows on installed local simulator build: 4/4 passed on a used and on a fresh iOS 26.5 simulator with Maestro 2.10.0.
- [x] `bun run validate`.
- [ ] Two-axis code-review against base `4321664`, documentation updated, commit to current feature branch.

## Rollback and risks

No schema or native-interface migration. SQLite unique fingerprints remain the final duplicate guard. Keep copy buffers and worker count fixed to contain aggregate memory; system picker cache copies remain outside Muse's copy scheduling. Completion is reported after cleanup. Cancellation is cooperative and does not undo durable inserts. Observer callbacks must not change import outcomes. Startup reconciliation is run once before work, never between active imports. Preserve source files on uncertain database commit, as in the single-file implementation. MuPDF stays local-build only under ADR 0001.
