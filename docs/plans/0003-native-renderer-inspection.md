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

- [ ] Inspection returns page count and document identity through the opaque renderer interface.
- [ ] Corrupt, encrypted, unsupported, and resource-limited input each return the matching category, with no path or content in any message or diagnostic.
- [ ] Inspection is cancellable, concurrency is bounded (proposed: 2 concurrent inspections, extras queued), and native resources are released on success, failure, and cancellation.
- [ ] Accessibility: no UI in this slice; user-facing error messages are plain, actionable sentences that #6 can display unchanged.
- [ ] Failure and cancellation behavior is defined and tested at the seam.
- [ ] Named fixtures record latency and memory: tiny PDF, image-heavy scan, malformed file, password-protected file, and a synthetic document near 100,000 pages. Each record notes device, OS, cold or warm state, and file fingerprint. Target: inspection cost scales with metadata reads, not total page count.
- [ ] No MuPDF-containing build can be distributed before the accepted licensing path in ADR 0001: production and preview EAS profiles exclude the module, and a CI check fails if they include it.
- [ ] The selected MuPDF release is pinned with a checksum, and the source is fetched reproducibly (no floating download during builds).

## Vertical slices

0. **Spike (no production API).** Build a pinned MuPDF for iOS simulator and device, link it in a local module scaffolded with `create-expo-module`, open one PDF, and print page count. Decide the native test harness, the memory-measurement method, and the production-profile exclusion mechanism. Output: findings appended to this plan, and an ADR update if the build approach changes ADR 0001.
1. [done] Failing contract test: valid PDF returns page count and fingerprint, then the `DocumentRenderer` types and the fake.
2. [done] Failing tests: each error category as a value, no paths in messages, then the fake and the error union.
3. [done] Failing tests: cancellation at the seam. Bounded concurrency is not observable through the interface, so it is verified natively in slice 7.
4. [done] Failing integration test: native error codes map to the union, then `createNativeDocumentRenderer`.
5. Native `inspect` success on the tiny fixture, through the contract suite on a simulator.
6. Native error paths and resource limits for the malformed, encrypted, and oversized fixtures.
7. Native cancellation, bounded concurrency, and cleanup verified with repeated runs.
8. Fixtures, measurements recorded in `docs/performance/`, production-profile exclusion and CI check, documentation.

## Validation

- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test:unit`
- [ ] `bun run test:integration`
- [ ] `bun run validate`
- [ ] Native fixture run on simulator (and one device when available)
- [ ] Full diff self-review
- [ ] Documentation updated (architecture seam, ADR 0001 pin, dependencies, requirements if limits change)

## Rollback and risks

- **Licensing (blocking for release, not for development).** MuPDF is AGPL-3.0. Building it into a development client is fine; shipping it is blocked until ADR 0001 records AGPL compliance or a commercial license. Mitigation is the profile exclusion and CI check above. Owner decision required before any TestFlight or store build.
- **Native build cost and reproducibility.** Compiling MuPDF adds build time. Mitigation: prebuild an xcframework from a pinned, checksummed source archive and cache it (see #14 for CI caching); never download during a build.
- **Native test harness uncertainty.** Local Expo modules under CNG may not host XCTest targets easily. The spike decides; the fallback is a debug-only runner that executes the contract suite on a simulator and reports results.
- **Cancellation is cooperative.** MuPDF calls are not interruptible mid-parse; cancellation takes effect at checkpoints and through a time limit. The interface promises a `cancelled` result, not instant stop, and the fixtures measure worst-case latency to cancel.
- **Rollback.** The module is additive and unused by the app until #6. Reverting the branch removes it with no data migration.

## Progress

- Slices 1 to 4 are implemented in TypeScript: `src/domain/document-renderer.ts`, `src/testing/fake-document-renderer.ts`, `src/features/reader/native-document-renderer.ts`, with the contract in `tests/support/` and tests in `tests/unit/` and `tests/integration/`.
- The native module contract is fixed: `inspectAsync(uri, operationId, maxBytes | null)` resolves a plain value `{status:'ok', pageCount, fingerprint}` or `{status:'error', code}` with codes `pdf_corrupt`, `pdf_encrypted`, `pdf_unsupported`, `file_too_large`, `cancelled`, `file_missing`, `io_error`; `cancel(operationId)` is synchronous. The adapter turns anything else (unknown code, malformed reply, thrown error) into an `internal` error and drops the thrown message, because it may hold a path.
- Remaining: slice 0 spike (pinned MuPDF build, native test harness, production-profile exclusion), then slices 5 to 8. The contract suite is what the native adapter must pass on a simulator.
