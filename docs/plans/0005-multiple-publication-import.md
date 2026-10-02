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
- Batch cancellation stops queued imports, cancels active inspection/copy, releases every temporary selected source, and preserves committed publications.
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

No schema migration; the native picker follow-up below adds a provider-import interface. SQLite unique fingerprints remain the final duplicate guard. Keep copy buffers and worker count fixed to contain aggregate memory; the native picker follow-up below brings provider copying under this same bound. Completion is reported after cleanup. Cancellation is cooperative and does not undo durable inserts. Observer callbacks must not change import outcomes. Startup reconciliation is run once before work, never between active imports. Preserve source files on uncertain database commit, as in the single-file implementation. MuPDF stays local-build only under ADR 0001.

## Session resource constraint

At the owner's request, commands run at low scheduling priority (`nice -n 15`), native/JavaScript build workers are capped at five of this Mac's ten cores, and heavy tasks run one at a time. The extra Darwin background restriction was removed after it severely stalled compilation; low priority and the worker cap remain. Review axes run sequentially. These are session controls, not product settings.

## Native accessibility follow-up

The installed maximum Dynamic Type check exposed progress wrapping into a narrow column beside Cancel. Before changing production layout, add an installed-UI assertion for a readable progress width across supported iPhone sizes. Put Cancel below the progress line, then repeat the native check at maximum text size and retain the longer Cancelling label without constraining progress width. Verify cancellation, result scrolling and relaunch at that size.

The E2E test build holds the real copied large file until cancellation so every CI flow remains required. A separate production-adapter benchmark probe aborts when the small file commits, verifying cancellation while the real large streaming copy is still active and cleanup of both active/queued selections.

## Final local evidence (2026-10-02)

`bun run lint`, `bun run typecheck`, `bun run test:unit` (47), `bun run test:integration` (77), `bun run test:ui` (12), and `bun run validate` passed sequentially. The installed width assertion failed with the inline Cancel layout and passed after moving Cancel below progress. Rendered tests cover accessible controls and completion announcements; the maximum Dynamic Type check covers the app after Files selection. The normal Release route was restored, rebuilt successfully, and passed navigation smoke. The disposable simulator was shut down afterward.

Immediate installed storage checks after mixed import and cancellation each found one durable two-page publication, one owned PDF, zero staging PDFs and zero picker cache files. The production streaming-copy probe additionally verified active/queued cancellation with the completed publication preserved. Three sequential and three batch runs, including a 100,000-page PDF, are recorded with sampled RSS and measurement limits in [the performance report](../performance/0003-publication-batch-import.md).

## Picker-copy review follow-up (2026-10-02)

The installed Expo iOS picker uses `asCopy: true` and then eagerly copies every selection into its cache. A Library worker limit cannot bound or cancel that earlier copy phase. Replace the iOS picker adapter with a local Expo module that opens provider URLs in place (`asCopy: false`) and returns opaque temporary source identifiers/names without reading or copying their bytes. The existing Library scheduler remains the application-facing seam.

The native import interface selects sources, copies one selected source directly into app-owned staging, cancels a copy operation, and releases a source. Native copy acquires security-scoped access only for an active operation, coordinates provider reads off the main thread, uses fixed 256 KiB chunks, enforces the existing 2 GiB per-file cap, and removes partial output on every failure/cancellation. A native two-operation limit provides a second guard; queued selections own only URLs, with no open scope, byte buffer or cache file. Module destruction cancels operations and releases selection state. JavaScript observes only opaque source IDs and owned staging paths; the renderer sees only staged app-owned files.

The owner confirmed the public native select/copy/cancel/release test seam on 2026-10-02, before the first behavior test. Planned vertical slices: selection performs no copy/access; copy success and immediate resource-limit/permission failures; cancellation and partial-file cleanup; admission/resource lifetime under concurrent requests; bridge adapter error/cancellation mapping; installed Files flows. Existing Library and rendered UI tests remain required. Repeat native build/flows, full validation, and both review axes before committing/pushing the review fix. Keep host-heavy work sequential, nice 15, five workers maximum.

## Owner UI follow-up (2026-10-02)

The owner requested matching active tab icon/label color and a larger, bold + action at the right of the Library title on the same row. Confirmed that active label means the selected bottom tab. Use the existing accent token for native and fallback selected labels, and retain muted inactive states. Move the existing Import PDFs action into the title row, render a 32-point bold platform plus symbol within a minimum 56-point target, preserve its accessible label, disabled states and Library behavior. The public Library and tab selection interfaces remain unchanged; this is a presentation change, verified through existing screen/tab tests and installed import/navigation flows rather than implementation-mirroring style tests. Constant header/icon work adds no per-publication or per-page allocation. Recheck large text and both light/dark presentation, then review the added diff before updating PR22.

## Native Search and scrolling follow-up (2026-10-02)

The owner expanded the UI slice with reference images: Library title left, bold + and disabled Edit right; a separate system Search tab and integrated bottom search input on iOS 26+ when both glass capabilities pass; Search before + in the header on unsupported platforms. Use native minimize-on-scroll, disabled under Reduce Motion, and complete token-based non-glass controls. Edit is explicitly disabled until editing is implemented.

Keep the agreed rendered LibraryScreen seam. First add a failing title-filter behavior test, then implement case-insensitive displayed-title filtering, clearing and no-results feedback. A native search route supplies the query and reloads the shared Library on focus; the fallback screen owns an inline search field and cancel action. Use one app Library instance across routes so startup reconciliation never runs against another instance's active staging files. Filtering scales with publication count and a virtualized result list, never page count. This is the initial search slice of Issue #8, not its recent/sorting acceptance criteria.

Acceptance: controls remain accessible at large text sizes; clearing/cancelling restores publications; search updates after imports; errors do not masquerade as empty search results; import cancellation/results remain unchanged. Validate rendered filtering and fallback controls, installed native Search/navigation/import flows, glass light/dark and maximum text, and native bar minimization with scrolling content. Run all required checks, normal Release smoke, and sequential review axes before updating PR22. No schema migration or new dependency is required.

## Native Search and minimize fixes (2026-10-02, second pass)

Installed iOS 26.5 simulator checks of the first Search/UI slice found that the tab bar never minimized on scroll (Reduce Motion off) and the header **+**/**Edit** controls showed no glass. Codex's two review findings were also open.

- **Minimize:** `LibraryScreen` wrapped its list in a `View`. The list is now the screen root. Scrolling down collapses the bar to the selected-tab and Search circles; a slow scroll up restores it.
- **Header glass:** `HeaderAction` now uses `GlassView` directly with an explicit 28-point radius and `colorScheme` from the app theme. The glass circle and pill render in light and dark. Three changes landed together (direct `GlassView`, explicit radius, `colorScheme`), so which one fixed the missing glass was not isolated.
- **Contrast finding:** the light accent measured 3.68:1 on canvas and 3.29:1 on surface. A new `accentText` token (light `#7E5839`, dark `#D9A77E`) is tested first at 4.5:1 and is used for the active tab icon/label pair and Cancel.
- **Shared Library finding:** `src/features/library/app-library.ts` owns the one app Library; the E2E harness installs its test adapters there. A rendered test fails without it.
- **Search:** the native Search tab shows the bottom search pill with clear/close controls and filters titles case-insensitively, in light and dark. At maximum Dynamic Type the header actions wrap below the title and stay tappable; the title itself breaks mid-word, which is unchanged from before and still needs a decision.

Constitution principle 9 (`@legendapp/list` for every scrolling list and scroll view) is applied: `LibraryScreen`, `Screen` and the Appearance screen use `ScrollList`, and native tab minimization still works with it on the simulator.

## Toast outcome feedback (2026-10-02, owner decision)

The owner asked to remove the Import results section and the loading and Cancel controls shown while the native Files sheet and the copy are active, and to report success or failure in a toast instead. This replaces the per-file results, progress and Cancel acceptance criteria above for the screen. The Library interface is unchanged: `importMany()` still returns every per-file result, and aborting on unmount still cancels queued and active work, so no native cancellation or cleanup guarantee is dropped. Users can no longer cancel an import from the UI.

### Slice and seam

Import PDFs opens Files, then shows one toast: success, duplicate, or an actionable failure. Seam: rendered `LibraryScreen` with a `ToastProvider`, through accessible roles and visible text (the agreed screen seam). The toast is a shared primitive in `src/ui/toast.tsx`; the provider mounts in the root layout so any screen can use `useToast()`.

### Behavior

- One toast at a time; a new toast replaces the current one. Success lasts 5 seconds, errors 8 seconds, and a tap dismisses it. It sits at the bottom, above the tab bar, so the Library header actions stay tappable (a top toast covered + and Edit). The tab bar height cannot be measured, so a fixed clearance is used.
- One imported file shows `<title> was imported.`; a duplicate or failure shows the existing per-file wording. Several files show one summary such as `Imported 2, 1 already in Library, 1 failed.` followed by the first failure's actionable message. A summary with any failure uses the error style. A picker failure shows its message as an error. A dismissed picker or an unmount shows nothing.
- No progress text, spinner, Cancel control or result rows. The + action stays disabled while an import runs. Publications still appear in the list as each file completes.
- The toast uses a glass surface only when both glass capability checks pass, with an opaque token surface otherwise, announces to VoiceOver on iOS, uses the alert role, wraps at large text sizes, and skips animation under Reduce Motion.

### Acceptance

- [ ] Success, duplicate, mixed and failure outcomes each show the right toast and announcement; no results section, progress or Cancel appears.
- [ ] The toast dismisses on tap and after its duration; unmounting during an import aborts it and shows nothing.
- [ ] Maestro flows assert the toast or the durable publication row; the cancellation flow becomes a large-file completion flow.
- [ ] Requirements, architecture and testing documents match.

### Risks

A large import now gives no in-screen feedback beyond the dimmed + action and appearing rows. No schema change and no new dependency.

Follow-through: `.maestro/import-cancel.yml` became `import-large.yml` (the 143 MB import completes and persists after relaunch), the harness no longer holds the large file for a Cancel tap, and the flows assert the batch toast or the durable publication rows. Fixing the existing `import-one` failure also showed that the iOS 26 integrated search dismiss control is labeled "Close", not "Cancel".
