# Muse architecture

## Architectural drivers

Muse optimizes for large-document performance, deterministic native resource management, offline privacy, and testability. The architecture keeps rendering complexity native and presents small interfaces to the TypeScript application.

## System shape

```text
Expo Router routes
      │
Screen modules and UI ─── Theme capability adapter
      │
Application use cases
      │
Domain modules (pure TypeScript)
      │
      ├── Publication repository adapter ─── SQLite
      ├── Publication file adapter ───────── Native provider import / Expo FileSystem
      └── Document renderer interface ────── Local Expo module ── MuPDF C
                                                       │
                                    render scheduler + memory cache + disk cache
```

Dependencies point inward. Domain modules do not import React, React Native, Expo, SQLite, or the native renderer.

## Source layout

```text
src/app/                 Expo Router route entries only
src/screens/             Route-independent screen bodies
src/features/library/    Library use cases, UI, and adapters
src/features/reader/     Reader use cases, UI, and adapters
src/domain/              Pure publication, bookmark, and reading-position modules
src/ui/                  Reusable React Native Reusables/Uniwind primitives
src/theme/               Semantic tokens and glass/fallback capability adapter
src/testing/             Shared test adapters and fixture builders
modules/mupdf-renderer/   Local Expo native module and vendored/native build integration
modules/native-tab-bounce/ Guarded iOS native tab icon animation
modules/publication-import/  In-place iOS picker and bounded, coordinated provider copying
tests/integration/        Cross-module JavaScript integration tests
tests/ui/                 React Native Testing Library rendered behavior tests
.maestro/                 Maestro flows against an installed simulator app
```

Existing source is migrated toward this layout only as features touch it; do not perform a speculative rewrite.

## Deep module seams

### Publication library

The application-facing interface expresses import, query, removal, and metadata updates. The implementation hides document-picker results, file copying, hashing, SQLite transactions, migrations, and cleanup compensation.

Key invariant: a publication becomes visible in the Library only after its owned file and metadata commit are both durable. Failed imports leave neither a row nor an orphaned file.

### Document renderer

The TypeScript interface should remain close to:

```ts
type DocumentHandle = string;

interface DocumentRenderer {
  open(uri: string, password?: string): Promise<DocumentSession>;
  close(handle: DocumentHandle): Promise<void>;
  render(request: PageRenderRequest): Promise<PageRendition>;
  search(request: TextSearchRequest): AsyncIterable<TextSearchBatch>;
  cancel(operationId: string): void;
}
```

The first slice ships only the one-shot `inspect(request)` and `cancel(operationId)` (returning a page count and content fingerprint, or a typed error as a value), so no handle exists yet to leak; `open`/`close` sessions arrive with the Reader. `DocumentSession` exposes immutable metadata and an opaque handle. It never exposes MuPDF pointers. Exact types are finalized by the native spike and recorded before tests are written.

The native implementation owns:

- MuPDF context, document, page, display-list, pixmap, and structured-text lifetimes;
- a priority scheduler where visible work outranks prefetch and search;
- bounded worker concurrency and serialized access where MuPDF requires it;
- cancellation and stale-result suppression;
- tile/full-page selection, pixel sizing, and color-space conversion;
- memory-cache accounting and disk-cache reads/writes;
- conversion of native failures into a small structured error union;
- instrumentation for open, parse, queue, render, cache-hit, cancellation, and memory metrics.

The UI receives native-renderable references or a native view surface, not Base64 image payloads. The spike must compare an Expo native view against file-backed rendition URIs before choosing the final view interface.

### Persistence

SQLite owns publication metadata, bookmarks, schema version, and reading positions. The filesystem owns source PDFs and derived rendition files. Database rows store relative owned paths, never temporary picker URLs.

All schema changes use forward migrations tested from every supported prior schema. Repository adapters use transactions and parameterized statements. Library schema 2 adds `is_favorite` with a default of false for existing publications; favorite updates leave owned files and reading metadata intact. Schema 3 adds `pending_publication_removals`. Removal atomically records the publication ID and relative owned path while deleting its visible row, then deletes that source and its `Paths.cache/renditions/<id>/` directory. The cleanup record is cleared only after both deletions succeed. Startup drains pending records sequentially before reconciliation; repeated cleanup is idempotent. A failed metadata commit preserves files. A committed removal with interrupted cleanup remains removed and reports that reopening Muse finishes freeing storage. Rename changes only the trimmed, nonempty displayed title.

## Rendering and cache pipeline

1. The reader reports the visible viewport and navigation direction.
2. The scheduler cancels obsolete low-priority work.
3. It checks the memory cache, then disk cache, then renders through MuPDF.
4. The visible page is rendered first at a useful resolution; refinement is allowed after interaction settles.
5. Adjacent pages are prefetched within a small adaptive window.
6. Memory and disk caches evict by byte budget, not entry count.
7. Closing a publication releases native objects and cancels all operations for its handle.

Page count affects metadata and index lookup, not eager allocation. Continuous mode uses a virtualized window whose size is independent of total page count.

## Import pipeline

Use the system document picker without eager import copies. On iOS, the local `PublicationImport` module opens files in place (`asCopy: false`) and returns opaque temporary source IDs and filenames. Only an active Library worker acquires security-scoped access, coordinates a provider read off the main thread and copies into app-owned staging. On other platforms, Expo DocumentPicker uses `copyToCacheDirectory: false`; the file adapter reads the returned source URI. Validate readability and the admission cap, compute a content fingerprint, inspect metadata through the native renderer, then atomically promote the file and commit SQLite metadata. Duplicate policy is fingerprint-based and must be a product decision in the implementation plan.

Selected files are untrusted. Impose size/resource limits, contain parser failures, avoid logging paths or publication text, and make cleanup idempotent.

The Library exposes `PublicationLibrary.list()`, `importOne()`, `importMany()`, `setFavorite(id, isFavorite)`, `rename(id, title)`, `remove(id)`, and `subscribe(listener)` to callers. Screens use `importMany()`; single-file callers and benchmarks can still use `importOne()`. Its adapters use the system picker, 256 KiB cancellable copy chunks into `staging/`, the existing native inspection seam, and SQLite schema version 3. The admission cap is 2 GiB. Metadata stores a relative `publications/` path and a unique SHA-256 fingerprint. An identical PDF returns the existing publication; it does not retain a second source. A valid staged file is promoted before its metadata insert. Every selected native source is released after its result, including queued cancellation. Native copies independently enforce a two-operation bound, close handles and security scopes before settling, and remove partial staging files on failure. Legacy picker cache copies are still cleared at startup. Startup reconciliation also removes staging files and unreferenced promoted files, while preserving files referenced by committed rows. If a database write has an uncertain outcome, the Library preserves the source until that reconciliation can safely decide.

Batch imports allow two active files, including copy, inspection, admission and cleanup. A worker takes the next selection only after the previous result settles; queued selections are released without copying when cancelled. Fingerprint lookup, file promotion and metadata insertion are serialized within the Library, with SQLite uniqueness remaining the final guard against external races. Progress reports a completed/total count and the newly settled per-file result. Final results retain selection indexes and filenames in picker order, so equal filenames remain distinguishable. Progress observers cannot alter durable outcomes. Cancellation preserves committed publications and suppresses stale inspection results. The Library interface keeps every per-file result, but LibraryScreen reports one toast per batch (`summarizeImport`) and shows no progress, results list or Cancel control; leaving the screen aborts the batch. LibraryScreen virtualizes publications only, so rows never scale with PDF page count.

## UI architecture

Use semantic tokens (`canvas`, `surface`, `accent`, `accentText`, `onAccent`, `text`, `mutedText`, `separator`, `destructive`) defined once in `src/theme/tokens.ts` for light and dark. `src/global.css` mirrors them for Uniwind classes, and `tests/unit/theme-tokens.test.ts` fails if the two drift. UI modules consume tokens, not hex values. The theme preference (System, Light, Dark) persists through `expo-sqlite/kv-store` behind the `createThemePreference` seam.

Shared primitives live in `src/ui/`: `Screen` (canvas, large title, gutters), `ListRow` (icon badge, title, value, chevron or check), `IconBadge`, `EmptyState`, `ScrollList` (the only scrolling primitive: a `LegendList` with Uniwind class names, also used for static screens with `data={[]}` and the content in the header), and `Toast` (`ToastProvider` in the root layout, `useToast()` in screens: one toast at a time above the tab bar, 5 seconds for success and 8 for errors, glass only when both capability checks pass, labeled and announced to VoiceOver). Screens compose these instead of styling ad hoc. Design rules: body text uses `text` or `mutedText` (both meet 4.5:1), the accent color is reserved for icons and selection marks (3:1 non-text) while small accent text, including the active tab label and its matching icon, uses `accentText` (4.5:1 on canvas and surface), rows are at least 80 points tall with an 8-point-grid inset divider, and every tab root uses the same large title.

The tab bar follows the same capability rule: `resolveTabBarKind` in `src/theme/glass-capability.ts` selects the native Liquid Glass tab bar on iOS 26+ and the custom JS tab bar elsewhere.

Native tab focus crosses `createNativeTabIconAnimator().select(index)` into the
Apple-only local `native-tab-bounce` module. Initial and repeated focus do not
animate. The native adapter finds one attached tab controller in visible windows
of active scenes, then one visible UIImageView whose image equals the selected
tab item's SF Symbol image. It uses public UIKit state, not private selectors,
class names, geometry, or navigation delegate replacement. Missing or ambiguous
targets skip the cosmetic effect; system Reduce Motion is checked live. Lookup
work and retries are bounded, newer requests supersede pending ones, and a weak
reference allows the previous bounce to be stopped without retaining UIKit views.
The custom fallback bar is unchanged. The probe and native checks are documented
in `docs/native-tab-bounce-spike.md`.

`GlassSurface` is a capability adapter with two adapters:

- iOS 26+ adapter using `expo-glass-effect` only when both compile-time/system and runtime API checks pass;
- fallback adapter using normal React Native/Uniwind surfaces.

Both adapters expose the same props and accessibility behavior. Glass is decoration, never the only indication of state.

Library, Search and Favorites use `LibraryScreen` with the same `PublicationRow`, title matching and virtualized list. Favorites filters the Library snapshot to `isFavorite` publications and offers an inline title search on every platform. Each row exposes a labeled heart action with selected/pending accessibility state and a 44-point target. Favorite changes display the committed result; failures retain the saved state and show actionable toast guidance. The shared Library notifies subscribers after durable imports, renames, favorite writes and removals; screens reload snapshots, unsubscribe on unmount and suppress reads started before a newer committed result. Applying a local favorite or import result starts a fresh full read so other committed changes are retained. Returned import rows stay visible until a successful snapshot includes their IDs. Loading failures have an explicit retry action and never appear as an empty collection. Rows also expose a labeled three-dot menu through platform menu adapters and a complete web adapter. Shared rename/removal dialogs retain drafts and errors until a durable result; confirmation names one publication. Their scrolling content remains accessible with large text and the keyboard, without animation. Reader opening remains a separate slice.

The iOS publication-menu override uses `@expo/ui/swift-ui` with a native symbol trigger and the publication-specific accessibility label on `Menu` itself. Keeping the trigger entirely in SwiftUI preserves its accessibility label after metadata updates. Android retains the community-menu adapter.

## Testing strategy

Tests observe behavior at agreed public seams:

- domain unit tests: reading-position rules, page-number conversion, cache-key construction, bookmark invariants;
- application integration tests: import transaction, duplicate handling, position persistence, repository migrations, renderer error mapping using in-memory adapters;
- native tests: C/Swift ownership, cancellation, cache eviction, corrupt/encrypted fixtures, concurrent render safety;
- E2E: Maestro flows against simulator builds; start with app launch/navigation smoke, then import fixture, open, navigate, relaunch/restore, bookmark, page jump, fallback/glass tests;
- performance: native benchmark fixtures with recorded device, OS, document fingerprint, cold/warm state, latency, memory, and cache result.

Do not mock internal collaborators. Use in-memory adapters at declared seams and fixture PDFs with known expected behavior.

## Build and delivery

- CNG generates root native projects; never commit them.
- `modules/mupdf-renderer` is a local Expo module created with `create-expo-module` when the native spike begins.
- MuPDF source/binaries must be reproducibly pinned, checksummed, and covered by the chosen license. No floating download during app builds.
- GitHub Actions runs deterministic Jest and React Native Testing Library validation on PRs and pushes to `develop` and `main`.
- GitHub Actions uses a macOS 26 runner with Xcode 26.6 and an iOS 26.5 simulator to run Maestro flows on feature PRs to `develop`. Local Xcode builds are the routine development path, including Xcode 27 with a tested iOS 26.5 simulator. EAS development and preview profiles remain available for beta testing, and the production profile serves stable releases. The EAS validation workflow is manual only.

## Failure handling

Errors cross seams as typed categories: `unsupported`, `corrupt`, `passwordRequired`, `permissionDenied`, `resourceLimit`, `cancelled`, and `internal`. User messages remain actionable; diagnostics preserve native codes without exposing local paths or content.

Crashes, out-of-memory terminations, interrupted imports, and cache corruption must be recoverable. Derived cache is always disposable; source publications and user metadata are not.


The glass tab shell adds a native search-role route with a nested Stack search controller. Its bottom search field feeds displayed-title filtering in the virtualized Library screen. The fallback exposes inline header search through the same screen. Both routes reuse one app Library instance from `src/features/library/app-library.ts` (the E2E build installs its test adapters there so Search never creates a second reconciler); focusing Search reloads its snapshot without creating another reconciler or reading PDF pages. Native tab minimization is delegated to iOS and disabled under Reduce Motion. A tab's `ScrollList` must be the first element of its screen with no wrapper view, because iOS finds the scroll view there (verified with `LegendList` on the iOS 26.5 simulator); `LibraryScreen` renders its list as the root. Glass header actions use `GlassView` directly with an explicit corner radius and the app's resolved color scheme.

Library browsing queries metadata through `PublicationLibrary.list(query)` and the shared pure `queryPublications` snapshot query. Recent filters opened publications, orders last-opened descending and caps at three; title search also applies to Recent. All publications default to recently imported. Date orders have oldest-first reverses; unopened publications stay last in both opened orders. Equal primary values use normalized displayed title then stable ID; descending title preserves ID ordering for equal titles. Queries normalize titles and parse sort timestamps once per matching publication, then compare cached keys. They allocate per publication, never per PDF page.

Library and native Search expose temporary selection over matching results. Changing search prunes hidden selections; Select all includes every matching publication even when virtualized offscreen. Confirmation captures selected publication IDs and states the count. `removeMany(ids, { signal })` deduplicates that captured set and runs the existing durable removal sequentially, reporting each outcome. Cancellation finishes the current durable removal and stops before the next; the pending dialog offers Stop removal and aborts on disposal. Unprocessed and failed publications remain selected for retry. Partial failures retain failed selections for retry; committed removals with pending cleanup remain removed and prompt relaunch. No schema or native adapter changes are required.

Library header controls use a compact, background-free variant on the non-glass fallback: 22-point symbols inside 44-point labeled targets, with Search, Import, and Edit beside the title. Glass header controls retain their larger surfaces. Headerless Library, Favorites, and Settings roots apply the Android top safe-area inset explicitly; iOS keeps automatic scroll inset adjustment. Theme saves run serially in tap order while the UI updates optimistically; only the latest request can report failure or restore the persisted preference.
