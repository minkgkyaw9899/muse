# Implementation plan: import and list one publication

Ticket: #6. Parent spec: #3. Branch: `feature/publication-import` from `origin/develop`.

## Outcome

A reader can choose one PDF from Files, then see its title, page count, and import date in Library after relaunch. An unsuccessful import leaves no visible publication or owned source file and explains what to do next.

## Required context read

- [x] `docs/constitution.md`, `docs/architecture.md`, `docs/requirements.md`
- [x] `CONTEXT.md`; ADR 0001 (MuPDF distribution gate) and ADR 0002 (owned storage)
- [x] `docs/branching.md`, `docs/agents/issue-tracker.md`, `docs/testing.md`
- [x] Project-installed `codebase-design`, `domain-modeling`, `tdd`, `code-review`, Expo Router/project structure/UI, and Uniwind guidance
- [x] Expo SDK 57 reference for DocumentPicker, FileSystem, and SQLite

## Scope

### Included

- One PDF per picker invocation; accessible Import action in empty and populated Library.
- Copy the picker result into a private staging file before native inspection. The native inspector supplies page count and SHA-256 fingerprint. Promote a valid staged file into app-owned publication storage, then durably insert its metadata.
- Persist a stable publication ID, displayed title, source filename, byte size, page count, fingerprint, import time, nullable last-opened time and reading position, and a relative owned path. List from SQLite after launch.
- Show import progress, a successful row, quiet cancellation, and actionable duplicate, corrupt, encrypted, unsupported, permission, storage, and renderer-unavailable results. No raw paths or PDF content in messages or logs.
- Recover after interrupted imports by removing stale staging files and unreferenced promoted files before displaying the Library. Do not delete a referenced source file.

### Excluded

- Multiple selection and per-file batch results (#7), Library search/sort/recent/rename/favorite/removal, and opening a publication in Reader (later tickets).
- MuPDF distribution or a licensing decision; local development builds alone may link the gitignored framework.

## Public seam and tests

**Confirmed with the owner on 2026-09-30, before the first behavior test:** `PublicationLibrary` in `src/features/library/publication-library.ts`. The UI calls `list(): Promise<Publication[]>` and `importOne(): Promise<ImportResult>`. `importOne` owns picker invocation and returns a success, cancel, duplicate, or typed failure result as a value. `Publication` contains durable metadata, never a picker URI. Construction accepts declared picker, owned-file, repository, renderer, clock, and ID adapters; those details stay behind the Library interface. The in-memory adapters implement the same seam for integration tests. This is the primary behavior-test surface, as required by #3 and #6.

- Integration seam: call `PublicationLibrary` with in-memory adapters; observe listed publications, import results, durable state after recreating the module, and absence of owned files after failures. Do not assert internal adapter call order.
- Persistence seam: exercise the SQLite repository through the same Library interface in a disposable simulator database, including initial schema creation, unique fingerprint, and relaunch. Use parameterized statements and an exclusive write transaction. There is no older shipped Library schema to migrate.
- Rendered UI seam: interact with Library's accessible Import control and observe loading, publication metadata, and failure text through React Native Testing Library.
- Installed-app seam: Maestro selects the committed two-page fixture through the Files picker on a local Release build with MuPDF linked, verifies its row, relaunches, and verifies persistence. The existing smoke flow remains relevant.

## Decisions and invariants

1. **Duplicate policy (confirmed with the owner on 2026-09-30):** a second import of the same SHA-256 reports “Already in Library” and returns the existing publication ID; it never creates another row or retained file. The database has a unique fingerprint constraint, which resolves races after an optimistic duplicate lookup.
2. **Admission order:** pick with `copyToCacheDirectory: true` and `multiple: false`; reject missing/unreadable or non-PDF input; copy with bounded memory into staging; inspect the app-owned staging URI with a unique operation ID and explicit byte limit; check duplicates; move to a unique final path; commit metadata; report success. The listing query reads committed rows only.
3. **Compensation and recovery:** close file handles and delete staging and the picker's app-cache copy on every terminal path. If promotion succeeds but metadata insertion fails, remove the promoted file. If deletion itself fails, surface a storage failure and remove the unreferenced file during startup reconciliation. Startup reconciliation also clears stale picker-cache copies. A crash cannot be made atomic across SQLite and the filesystem, so reconciliation is part of the public `list()` behavior.
4. **Resource policy:** one import at a time per Library instance; reject or disable another request while busy. Cap source size at 2 GiB initially, check known picker/file size before copy, enforce the cap while copying, and pass the same cap to `DocumentRenderer.inspect`. Copy in fixed-size chunks (256 KiB) off the UI path; never create a page-sized or file-sized JS array. Record copy, inspect, and commit timings separately.
5. **Title policy:** use the picker filename without the final `.pdf` suffix as the display title, trimming surrounding whitespace; retain the original filename separately. A blank title falls back to “Untitled publication”. User rename is deferred.
6. **Cancellation:** picker dismissal is a normal cancel result. If the screen unmounts during copy or inspection, request cancellation; the renderer cancel is cooperative, and cleanup runs after it settles. The UI ignores stale completion after unmount.

## Acceptance criteria

- [x] Empty Library offers a labeled, at-least-44-point Import target, usable with VoiceOver and Dynamic Type. Populated Library offers the same action.
- [x] The two-page fixture is copied before inspection; one durable row displays its title, two pages, and a localized import date after relaunch.
- [x] Duplicate, corrupt, encrypted, unsupported, permission, full-storage, and renderer-unavailable outcomes are actionable; cancellation is quiet.
- [x] A failed import leaves no visible row or owned source orphan, including failures after promotion and an interrupted import recovered at next launch.
- [x] Integration behavior is tested through the agreed Library interface; UI behavior is tested through accessible controls and visible text.
- [x] Named fixture measurements record device/OS, file size, fingerprint, cold/warm state, copy/inspect/commit latency, and sampled peak memory. Compare the two-page PDF, the 143 MB scan, and the 100,000-page synthetic fixture. No latency target is claimed until measured on a baseline iPhone; memory growth must remain bounded by the copy chunk and native inspector budget, not page count. See [measurement limits](../performance/0002-publication-import.md) for the simulator sampling and unmeasured near-cap/device cases.

## Vertical slices

1. [done] Confirm the public seam. Write one failing Library-interface test for a valid import and durable listing; implement the smallest complete in-memory flow.
2. [done] Test and implement duplicate detection and unique-fingerprint race behavior.
3. [done] Test and implement failure compensation, cancellation, and startup reconciliation through the same Library seam.
4. [done] Add SQLite and Expo picker/file adapters; test SQLite behavior in a disposable simulator database and exercise real native inspection in a local Release build with development modules.
5. [done] Add the Library screen states and accessible import action, with one rendered behavior test at a time.
6. [done] Add the installed-app Maestro flow and record fixture measurements.

## Validation and review

- [x] Regular `bun run typecheck` and focused test-file runs during each slice.
- [x] `bun run lint`, `bun run typecheck`, `bun run test:unit`, `bun run test:integration`, `bun run test:ui`.
- [x] Relevant Maestro flows on an installed simulator local Release build with MuPDF linked.
- [x] `bun run validate` after fixing failures.
- [x] Two-axis `code-review` against `origin/develop`; fix findings and review the entire diff for correctness, scope, accessibility, performance, and security.
- [x] Update affected architecture, testing, operational/performance notes, and this plan; commit the reviewed work to the current feature branch. Existing requirements and ADRs remain applicable. Push/open a PR only when requested.

### Recorded evidence (2026-09-30)

`bun run lint` and `bun run validate` passed: 47 unit, 66 integration, and 9 rendered UI tests. The final local Release build passed `smoke.yml` and `import-one.yml` on the iOS 26.5 iPhone 17 Pro simulator. The import flow confirms selection, metadata, relaunch persistence, and duplicate admission. Storage inspection after duplicate admission confirmed one two-page database row, one owned PDF, zero staging PDFs, and zero picker-cache PDFs. Files navigation uses its native sidebar-cell and fixture identifiers, with taps inside their interactive regions. Both review axes have zero remaining findings. [Performance evidence](../performance/0002-publication-import.md) includes full-adapter timings, RSS samples, and the rejected faster-copy experiments; physical-iPhone and near-cap measurements remain explicitly unclaimed.

## Risks and rollback

The filesystem and SQLite cannot share a transaction; idempotent startup reconciliation protects against interruption between promotion and commit. A unique fingerprint protects duplicate admission under concurrent imports. Large picker and copy operations can fill storage, so all temporary bytes need deterministic cleanup and actionable errors. MuPDF is local-build only until ADR 0001 accepts a distribution path. This slice creates schema version 1; migration from a later schema is not needed yet, and rollback removes the feature code and its unshipped schema before release.
