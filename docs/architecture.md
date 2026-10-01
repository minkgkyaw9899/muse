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
      ├── Publication file adapter ───────── Expo FileSystem/DocumentPicker
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

All schema changes use forward migrations tested from every supported prior schema. Repository adapters use transactions and parameterized statements.

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

Use the system document picker with `copyToCacheDirectory: true`, validate type and readability, stream-copy into a staging file, compute a content fingerprint, inspect metadata through the native renderer, then atomically promote the file and commit SQLite metadata. Duplicate policy is fingerprint-based and must be a product decision in the implementation plan.

Selected files are untrusted. Impose size/resource limits, contain parser failures, avoid logging paths or publication text, and make cleanup idempotent.

The Library exposes `PublicationLibrary.list()`, `importOne()`, and `importMany()` to callers. Screens use `importMany()`; single-file callers and benchmarks can still use `importOne()`. Its adapters use the system picker, 256 KiB cancellable copy chunks into `staging/`, the existing native inspection seam, and SQLite schema version 1. The admission cap is 2 GiB. Metadata stores a relative `publications/` path and a unique SHA-256 fingerprint. An identical PDF returns the existing publication; it does not retain a second source. A valid staged file is promoted before its metadata insert. The picker's app-cache copy is released on every result, with stale cache copies cleared at startup. Startup reconciliation also removes staging files and unreferenced promoted files, while preserving files referenced by committed rows. If a database write has an uncertain outcome, the Library preserves the source until that reconciliation can safely decide.

Batch imports allow two active files, including copy, inspection, admission and cleanup. A worker takes the next selection only after the previous result settles; queued selections are released without copying when cancelled. Fingerprint lookup, file promotion and metadata insertion are serialized within the Library, with SQLite uniqueness remaining the final guard against external races. Progress reports a completed/total count and the newly settled per-file result. Final results retain selection indexes and filenames in picker order, so equal filenames remain distinguishable. Progress observers cannot alter durable outcomes. Cancellation preserves committed publications and suppresses stale inspection results. LibraryScreen virtualizes results and publications together; result views never scale with PDF page count.

## UI architecture

Use semantic tokens (`canvas`, `surface`, `accent`, `onAccent`, `text`, `mutedText`, `separator`, `destructive`) defined once in `src/theme/tokens.ts` for light and dark. `src/global.css` mirrors them for Uniwind classes, and `tests/unit/theme-tokens.test.ts` fails if the two drift. UI modules consume tokens, not hex values. The theme preference (System, Light, Dark) persists through `expo-sqlite/kv-store` behind the `createThemePreference` seam.

Shared primitives live in `src/ui/`: `Screen` (canvas, large title, gutters), `ListRow` (icon badge, title, value, chevron or check), `IconBadge`, and `EmptyState`. Screens compose these instead of styling ad hoc. Design rules: body text uses `text` or `mutedText` (both meet 4.5:1), the accent color is reserved for icons and selection marks (3:1 non-text), rows are at least 80 points tall with an 8-point-grid inset divider, and every tab root uses the same large title.

The tab bar follows the same capability rule: `resolveTabBarKind` in `src/theme/glass-capability.ts` selects the native Liquid Glass tab bar on iOS 26+ and the custom JS tab bar elsewhere.

`GlassSurface` is a capability adapter with two adapters:

- iOS 26+ adapter using `expo-glass-effect` only when both compile-time/system and runtime API checks pass;
- fallback adapter using normal React Native/Uniwind surfaces.

Both adapters expose the same props and accessibility behavior. Glass is decoration, never the only indication of state.

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
