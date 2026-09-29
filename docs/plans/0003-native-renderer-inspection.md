# Implementation plan: inspect one PDF through the native renderer seam

Ticket: #5. Parent spec: #3. Unblocks #6 (Import and list one publication).

## Outcome

Muse can hand one app-owned local PDF to a native renderer module and get back bounded, structured metadata (page count and document identity), or a typed error. No page is rendered, and no MuPDF object, pointer, or path crosses into JavaScript.

## Required context read

- [x] `docs/constitution.md`
- [x] `docs/architecture.md`
- [x] `docs/requirements.md`
- [x] `CONTEXT.md` terms and ADR 0001 (MuPDF via local Expo module), ADR 0002 (owned storage)
- [x] `codebase-design` and `expo-module` skills; Expo SDK 57 Module API reference (`https://docs.expo.dev/modules/module-api.md`)
- [x] `tdd` skill

## Scope

### Included

- A small typed TypeScript interface, `DocumentRenderer.inspect`, in a pure domain-facing module with no React Native, Expo, or MuPDF imports.
- A structured error union (`unsupported`, `corrupt`, `passwordRequired`, `resourceLimit`, `cancelled`, `internal`) that never carries paths or document content.
- Cancellation by operation id, bounded concurrency, and deterministic native cleanup.
- An in-memory fake renderer and a shared contract test suite that any renderer adapter must pass.
- A local Expo module `modules/mupdf-renderer` (iOS first) with a pinned, checksummed MuPDF release, exposing only `inspect` and `cancel`.
- Named fixtures and recorded latency and memory evidence.
- A guard so no MuPDF-containing build can be distributed before ADR 0001 records an accepted licensing path.

### Excluded

- Rendering pages, tiles, caches, search, and the reader view. They arrive with the Reader tickets.
- `open`/`close` sessions. `inspect` opens and closes internally, so no handle can leak.
- Library storage, the picker, and copying files (#6).
- Android. The module stays buildable but has no MuPDF implementation until the iOS reader is proven.
- Choosing the MuPDF licensing path. That is a decision for the project owner, not this slice.

## Seams and tests

Public seam, confirmed with the project owner (one-shot `inspect` plus `cancel`; identity is a native SHA-256 of the file bytes):

```ts
type InspectionRequest = {
  /** App-owned file URI, never a picker URL. */
  uri: string;
  operationId: string;
  limits?: { maxBytes?: number };
};

type Inspection = {
  pageCount: number;
  /** Stable identity of the file's bytes. */
  fingerprint: string;
};

type RendererError = {
  category: 'unsupported' | 'corrupt' | 'passwordRequired' | 'resourceLimit' | 'cancelled' | 'internal';
  /** Native diagnostic code, safe to log: no paths, no content. */
  code: string;
  message: string; // actionable, user-facing
};

type InspectionResult = { ok: true; inspection: Inspection } | { ok: false; error: RendererError };

interface DocumentRenderer {
  inspect(request: InspectionRequest): Promise<InspectionResult>;
  cancel(operationId: string): void;
}
```

The interface is two methods. Results are values, not thrown exceptions, so callers must handle every category. Callers never see a handle, so the caller cannot forget to close one.

- Unit seam: `DocumentRenderer` through the in-memory fake (`src/testing/fake-document-renderer.ts`) and the shared contract in `tests/support/document-renderer-contract.ts`. Behavior: valid fixture returns page count and fingerprint; each error category is returned as a value; `cancel` before completion yields `cancelled`; cancelling an unknown id is a no-op; results never contain the input path.
- Contract seam: one `documentRendererContract(createRenderer)` suite runs against the fake now and against the native adapter in the app later. This is the "two adapters" that makes the seam real.
- Integration seam: `createNativeDocumentRenderer(nativeModule)` maps the native module's coded failures into the `RendererError` union. Tested with an in-memory stand-in for the native module at the module boundary, which is a declared seam, not an internal collaborator.
- Native seam: fixtures exercised on a simulator against the real module. The harness form (Swift XCTest in a local module, or a debug-only in-app runner) is decided in slice 0 because it depends on what Expo local modules support under CNG.

## Decisions

1. **Document identity:** the native module streams the file once and returns a SHA-256 of its bytes as `fingerprint`, with fixed memory use. Chosen over the PDF trailer `/ID`, which is absent or non-unique in many real files.
2. **Seam shape:** one-shot `inspect` plus `cancel`. `open`/`close` sessions arrive with the Reader.
3. **Missing owned file:** returned as `internal` with code `file_missing`, because an owned file that vanished is an integrity fault, not user input. Revisit when #6 defines the Library's missing-file state.

## Acceptance criteria

- [x] Inspection returns page count and document identity through the opaque renderer interface.
- [x] Corrupt, encrypted, unsupported, and resource-limited input each return the matching category, with no path or content in any message or diagnostic.
- [x] Inspection is cancellable, concurrency is bounded (proposed: 2 concurrent inspections, extras queued), and native resources are released on success, failure, and cancellation.
- [x] Accessibility: no UI in this slice; user-facing error messages are plain, actionable sentences that #6 can display unchanged.
- [x] Failure and cancellation behavior is defined and tested at the seam.
- [~] Named fixtures record latency and memory: tiny PDF, image-heavy scan, malformed file, password-protected file, and a synthetic document near 100,000 pages. Each record notes device, OS, cold or warm state, and file fingerprint. Target: inspection cost scales with metadata reads, not total page count.
- [x] No MuPDF-containing build can be distributed before the accepted licensing path in ADR 0001: production and preview EAS profiles exclude the module, and a CI check fails if they include it.
- [x] The selected MuPDF release is pinned with a checksum, and the source is fetched reproducibly (no floating download during builds).

## Vertical slices

0. [done] **Spike (no production API).** Build a pinned MuPDF for iOS simulator and device, link it in a local module scaffolded with `create-expo-module`, open one PDF, and print page count. Decide the native test harness, the memory-measurement method, and the production-profile exclusion mechanism. Output: findings appended to this plan, and an ADR update if the build approach changes ADR 0001.
1. [done] Failing contract test: valid PDF returns page count and fingerprint, then the `DocumentRenderer` types and the fake.
2. [done] Failing tests: each error category as a value, no paths in messages, then the fake and the error union.
3. [done] Failing tests: cancellation at the seam. Bounded concurrency is not observable through the interface, so it is verified natively in slice 7.
4. [done] Failing integration test: native error codes map to the union, then `createNativeDocumentRenderer`.
5. [done] Native `inspect` success on the tiny fixture. The JS contract suite cannot run inside a simulator, so this slice has three parts: the TypeScript wiring (`createMupdfDocumentRenderer`, with a `renderer_unavailable` result when the module is not linked), host-side C tests (`bun run test:native`) against committed fixtures under AddressSanitizer and UBSan, and a manual simulator run of the real adapter (below).
6. [done] Native error paths and resource limits for the malformed, encrypted, and oversized fixtures (host C tests; the encrypted fixture is made with `mutool` from the pinned source; the byte-limit boundary is tested, and a mutation of it fails the suite).
7. [done] Native cancellation, bounded concurrency, and cleanup verified with repeated runs (host C tests; the adapter forwards `cancel` only for in-flight operations).
8. [done] Fixtures, measurements recorded in `docs/performance/0001-pdf-inspection.md`, production-profile exclusion and CI check (`tests/integration/mupdf-gate.test.ts`), documentation. Maestro automation of the bridge check moved to #6, which provides a real screen to drive.

## Validation

- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test:unit`
- [x] `bun run test:integration`
- [x] `bun run validate`
- [~] Native fixture run on simulator (manual, tiny fixtures, uncommitted screen; no physical device). The review fixes were re-checked the same way: in-container file ok, `/etc/hosts` refused, directory unsupported, NaN limit handled in both layers, duplicate id refused
- [x] Full diff self-review (two-axis code review; findings below)
- [x] Documentation updated (architecture seam, ADR 0001 pin, dependencies, testing, performance record)

## Rollback and risks

- **Licensing (blocking for release, not for development).** MuPDF is AGPL-3.0. Building it into a development client is fine; shipping it is blocked until ADR 0001 records AGPL compliance or a commercial license. Mitigation is the profile exclusion and CI check above. Owner decision required before any TestFlight or store build.
- **Native build cost and reproducibility.** Compiling MuPDF adds build time. Mitigation: prebuild an xcframework from a pinned, checksummed source archive and cache it (see #14 for CI caching). App builds never download MuPDF; the explicit `scripts/build-mupdf.sh` step downloads once, refuses an archive whose SHA-256 differs, and re-extracts if the cached tree does not match.
- **Native test harness uncertainty.** Local Expo modules under CNG may not host XCTest targets easily. The spike decides; the fallback is a debug-only runner that executes the contract suite on a simulator and reports results.
- **Cancellation is cooperative.** MuPDF calls are not interruptible mid-parse (including the repair scan of a damaged file); cancellation takes effect at checkpoints. There is no time limit: callers own timeouts and can cancel. The interface promises a `cancelled` result, not instant stop, and the fixtures measure worst-case latency to cancel.
- **Rollback.** The module is additive and unused by the app until #6. Reverting the branch removes it with no data migration.

## Progress

All eight slices are done on the local branch. Acceptance criteria are met except where marked `[~]`: measurements come from a Mac host and the simulator, not a physical iPhone, and the bridge check was manual. The TypeScript seam is `src/domain/document-renderer.ts`, with the shared error table in `src/domain/renderer-errors.ts`, the fake in `src/testing/`, and the native adapter and loader in `src/features/reader/`. The native module contract is `inspectAsync(uri, operationId, maxBytes | null)` returning `{status:'ok', pageCount, fingerprint}` or `{status:'error', code}`, plus a synchronous `cancel(operationId)`.

## Spike findings (slice 0)

- **Build.** MuPDF 1.28.5 (`mupdf-1.28.5-source.tar.gz`, SHA-256 `98a5c10cda20c3992cdf76ff6b2a1149c32bd79cc796d3f703230b1185b7e934`, 68,919,385 bytes, from Artifex's official archive) has no iOS target in its Makefile but cross-compiles with the generic Unix path and an explicit iOS compiler. The iOS SDK declares no `getentropy()`, so `scripts/build-mupdf.sh` supplies a shim header backed by `arc4random_buf`; upstream source is untouched. Both slices (device arm64, simulator arm64) build in about 66 seconds on a 10-core Mac and merge into one `MuPDF.xcframework` (about 124 MB unstripped). No x86_64 simulator slice: Apple silicon only.
- **Native call works.** A local Expo module (`modules/mupdf-renderer`: C wrapper plus Swift module) linked into the development build. From JavaScript on the iOS 26.5 simulator: a 2-page PDF with no cross-reference table returned `pageCount: 2` and its fingerprint in 9 ms (MuPDF repaired the file on open); a `%PDF-` file with garbage returned `pdf_corrupt`; plain text returned `pdf_unsupported`; a 10-byte limit returned `file_too_large`; a missing file returned `file_missing`. The fingerprint equals an independently computed SHA-256 of the same bytes.
- **Classification rule in use.** A file without a `%PDF-` marker in its first 1 KB is `pdf_unsupported`; one that has it but fails to parse is `pdf_corrupt`. Files MuPDF can repair open successfully, which is the desired reader behavior.
- **Licensing gate (decision).** MuPDF is opt-in by building the framework. If `modules/mupdf-renderer/ios/Frameworks/MuPDF.xcframework` is absent, which is the default, the module compiles as a stub that returns `renderer_unavailable` and links no MuPDF code. Only builds that run `scripts/build-mupdf.sh` (development builds and CI test builds) contain MuPDF. Slice 8 adds a CI check that preview and production profiles never run it.
- **Native test harness (decision).** Host-side C tests for `muse_inspect` (fixtures, limits, cancellation, ownership under AddressSanitizer; LeakSanitizer is unavailable on Apple silicon, so leaks use the `leaks` tool) plus a Maestro flow on a dev-only screen for the bridge. XCTest inside a local Expo module pod was not pursued: it adds project surface under CNG for little coverage the C and Maestro layers do not give.
- **Memory measurement (decision).** `getrusage` peak RSS around each inspection in a dev-only native function, recorded per fixture with device and OS.
- **Open risks.** Static libraries are large and unstripped; measure the linked app size delta and trim unused format handlers (EPUB, XPS, CBZ, SVG, JavaScript) with MuPDF's build config in a follow-up. Only tiny files were timed; the 100,000-page fixture is still to come. The encrypted-PDF fixture is not exercised yet. `renderer_unavailable` is not yet a known code in the adapter, so it currently maps to `internal` (add a mapping test in slice 6). Cancellation and bounded concurrency do not exist natively yet. Because a cancel can arrive before the native call starts, the adapter should forward `cancel` only for in-flight operation ids, and the native side must record a pending cancel for an id whose inspection has not started; design this test-first in slice 7.

## Slice 5 results

- `createMupdfDocumentRenderer()` returns the native-backed renderer, or one that reports `renderer_unavailable` when the module is not in the build. The adapter also maps the stub build's `renderer_unavailable` code.
- `bun run test:native` builds a macOS MuPDF library (`scripts/build-mupdf.sh --host`, cached under `.cache/`) and runs `tests/native/muse_inspect_test.c` against `tests/fixtures/pdf/`. The success test failed against the stub configuration and passes against MuPDF. The expected fingerprint is a literal computed independently with `shasum`. This command needs macOS and is not part of `bun run validate`.
- Manual simulator check (iOS 26.5, development build, real adapter): the valid PDF returned `pageCount: 2` and the expected fingerprint; the truncated PDF, the text file, and a 10-byte limit returned `corrupt`, `unsupported`, and `resourceLimit` with the adapter's user-facing messages. The check ran from a temporary screen that was not committed. Automating it as a Maestro flow is part of slice 8.
- Notes: `CC_SHA256_*` is deprecated on Apple platforms (a build warning); the CryptoKit replacement is Swift-only, so revisit when the hashing moves. MuPDF prints its repair warnings to stderr; they contain no file content, but silence them with a warning callback before release.

## Slice 6 and 7 results

- **Error paths.** Host C tests cover password protected (`pdf_encrypted`, with an AES-256 fixture generated by `mutool` from the pinned source), damaged (`pdf_corrupt`), non-PDF (`pdf_unsupported`), missing (`file_missing`), and over-limit (`file_too_large`) inputs, the inclusive byte-limit boundary, and that failures carry no partial metadata. These behaviors existed from the spike; the tests characterize them, and a deliberate mutation of the limit comparison fails the suite.
- **Cancellation.** `muse_cancel(operation_id)` works for running, queued, and not-yet-started operations. A cancel that arrives first is remembered in a fixed ring of 64 ids, so unmatched cancels cannot accumulate (5,000 unmatched cancels are tested). A running 1 GB inspection returns `cancelled` within 250 ms of the cancel (checkpoints: between 64 KB reads, before the MuPDF open, and after it). A single MuPDF parse cannot be interrupted, so a cancel during the parse takes effect when it returns. Operation ids must be unique per operation.
- **Bounded concurrency.** At most 2 inspections run at once (exactly 2 is asserted under 6 simultaneous requests); the rest queue, still complete, and can be cancelled while queued without ever running.
- **Cleanup.** After 1,200 repeated inspections across success, failure, and cancellation: no file descriptors leaked, peak memory did not grow, and macOS `leaks` reports 0 leaks.
- **Test passes.** `bun run test:native` runs plain, AddressSanitizer + UBSan, ThreadSanitizer (no races), and `leaks`. The memory-growth assertion is skipped only in sanitizer builds, where quarantine memory dominates RSS. Mutations of the concurrency limit, the pending-cancel path, and the hash-loop cancel check each fail the suite.
- **Adapter.** `createNativeDocumentRenderer` forwards `cancel` only for in-flight ids (new tests).
- **Bridge check.** On the iOS 26.5 simulator with the real adapter: encrypted returned `passwordRequired`, an immediate cancel returned `cancelled`, and 8 concurrent inspections all succeeded.
- **Known limits.** While queued, a waiting inspection blocks one thread of the Expo module's pool; the bounded queue depth (128 operations) returns `io_error` beyond that. Revisit if the Library imports very large batches (#7).

## Slice 8 results

- **Fixtures and measurements.** `scripts/generate-pdf-fixtures.ts` builds valid 1k, 10k, and 100k page documents (balanced page tree, page counts confirmed by `mutool`), a 143 MB image-heavy scan, and a truncated file that forces MuPDF's repair scan. `bun run bench:native` measures them; results, method, and limits are in `docs/performance/0001-pdf-inspection.md`. On an Apple M4 host, 100,000 pages inspect in about 6 ms warm; a 143 MB scan takes about 59 ms (hashing at about 2.4 GB/s); peak memory growth stays under 7 MB.
- **Size decision.** Bundled fonts made an inspection-only binary 38.1 MB. The build now defaults to MuPDF's font-trimming flags (`scripts/mupdf-config.sh`), giving 6.1 MB (xcframework 124 MB to 34 MB). Revisit when the Reader renders text.
- **Licensing gate.** `tests/integration/mupdf-gate.test.ts` runs in `bun run validate` on every CI run: the framework is never tracked or un-ignored, the podspec vendors MuPDF only when the framework was built locally, EAS build hooks and `eas.json` never mention MuPDF, and only allowlisted test workflows may build it (never alongside `eas build`, submit, upload, or TestFlight steps). Mutations of each rule fail the suite.
- **Deferred.** Maestro automation of the bridge check goes to #6. Budgets in the performance record are provisional until measured on a physical device.
- **Not met as written.** The plan asked for latency and memory records with device and OS: the record is on a Mac host, not an iPhone (marked `[~]` above).

## Review follow-ups

A two-axis review (standards and spec) of the whole branch found real defects, fixed test-first where the behavior is observable:

- **Fixed.** Missing `fz_var` for locals used after MuPDF's setjmp-based catch; `Int64(Double)` trap on NaN or infinity (now validated in the adapter and in Swift); unbounded work on non-regular files, where a pipe blocked `open()` forever (now opened non-blocking and required to be a regular file); the byte limit is enforced while streaming as well as up front; the file is opened once and the same handle is hashed and parsed, so the fingerprint describes the bytes MuPDF read; non-PDFs are rejected from their first bytes instead of after hashing everything; duplicate, empty, and overlong operation ids are refused (`invalid_request`) instead of truncated; MuPDF exceptions are classified (system, limit, unsupported, abort, otherwise corrupt) instead of all mapping to corrupt; queue overflow reports `too_many_operations` (a `resourceLimit`); the test hooks compile only with `MUSE_TESTING`; `sprintf` became `snprintf`; the error table, messages, and codes live in one domain module shared by the adapter, the unavailable renderer, and the fake; the unused module TypeScript file was removed; the gate test moved to `tests/integration/` as `docs/testing.md` prescribes; Node types are referenced by the two files that need them instead of globally in `tsconfig.json`; the build script re-extracts a cached source tree that does not match the pinned checksum; Swift accepts only `file://` paths inside the app's own container, with symlinks resolved; the benchmark now prints fingerprints and the generated fixtures are deterministic.
- **Corrected claims.** The performance record no longer says repair is cancellable, no longer presents the 250 ms cancel assertion as a measured worst case, and now lists fingerprints.
- **Accepted, not changed.** The font trimming, ThreadSanitizer, `leaks`, and mutation testing go beyond what the ticket asked but bear directly on its acceptance criteria and size risk. The licensing gate keeps MuPDF out by default and by test, but does not stop someone from building MuPDF into a local `eas build --local` or Release build after running the build script; only review and ADR 0001 cover that. No time limit exists (callers own timeouts). While queued, an inspection blocks one thread of the module's pool, capped at 128 operations. A finished operation's late cancel can sit in the pending ring, so the adapter forwards cancels only for in-flight ids.
- **Follow-ups.** Run `bun run test:native` in CI (needs a macOS job; belongs with #14). Automate the bridge check as a Maestro flow and measure on a physical iPhone under #6, which provides a real screen to drive it.
