# Implementation plan: faster iOS CI builds (#14)

## Outcome

Repeat `iOS Maestro E2E` runs skip C++ compilation of unchanged native code, docs-only changes never pay for a macOS build, and every run reports where its time went so before/after timings can be recorded on the ticket.

## Required context read

- [x] `docs/constitution.md`, `docs/architecture.md`, `docs/requirements.md`
- [x] `CONTEXT.md` (no domain terms involved), ADR 0001 (MuPDF gate), `docs/testing.md`
- [x] Relevant skills: implement, tdd. No module interface or domain language changes, so `codebase-design` and `domain-modeling` do not apply. No Expo SDK interface is used beyond `expo-build-properties` options already in `package.json`.

## Evidence (CI run logs, runs 36650819490 to 36992882433, plus a local reproduction)

- Build step: 852 to 1,568 s on every run; caches made no measurable difference.
- In a 1,427 s build, 780 s was `Compiling`, of which `RNReanimated` alone was 504 s, `RNScreens` 95 s, `RNWorklets` 29 s and `RNGestureHandler` 25 s. This is C++ that ccache is designed to cache. Swift and prebuilt modules are not the bottleneck.
- `ccache --show-stats` reported 0.0 GB and `actions/cache` warned that `~/.ccache` did not exist, so no ccache was ever saved.
- Root cause (reproduced locally on Xcode 27 and verified on Xcode 26.6, the runner's version): the Pods project is configured by React Native with `CC=ccache-clang.sh` and a `CCACHE_BINARY` build setting. Xcode does run the wrapper, but custom build settings are not exported into compile tasks, so `$CCACHE_BINARY` is empty and the wrapper runs plain `clang`. Ambient environment variables (such as `CCACHE_DIR`) do reach it. A second problem hid behind the first: ccache rejected every call (187 of 187) until `ivfsoverlay` sloppiness was set. With both fixed, the RNReanimated scheme builds in 53 s cold and 6 s warm (187 of 187 hits) on Xcode 26.6.
- The `Plan build and cache use` step did not exist in the only docs-only PR run (#19), so docs-only skipping has never been exercised. On `push` to `develop` the step cannot skip at all, so every docs-only merge rebuilds for about 28 minutes.
- Other recurring costs per run: MuPDF build about 185 s (cannot be cached under ADR 0001's gate without a policy decision), simulator boot 140 to 210 s (overlapping it with the MuPDF build was tried and measured as a net loss; see testing.md).

## Scope

### Included

1. Make ccache engage (export the resolved ccache path and the `ivfsoverlay` sloppiness, with depend mode), and warn in the job summary when a build compiles nothing through ccache.
2. Extract build planning into a testable script and extend it to `push` events, so docs-only merges to `develop` skip the macOS build.
3. (Dropped after measurement) Start the simulator boot early. It made the MuPDF and native tests about 160 s slower on two runs, so the sequential boot was restored.
4. Publish step timings and ccache statistics to the job summary, with an opt-in xcodebuild timing summary (a tested shim) for manual runs.
5. Update `docs/testing.md` with the corrected description and measured results.

### Excluded

- Caching the MuPDF framework (needs an ADR 0001 decision; the gate test allows only building it in test workflows).
- Changing Release optimization levels for CI builds (alters what is tested).
- Pushing branches or running GitHub workflows (the owner chose local verification first).
- Any app, Library, or reader code.

## Seams and tests

- Unit seam: `scripts/ci-plan-build.sh`. Input: environment `EVENT`, `CLEAN_INPUT`, changed paths on standard input. Output: `run_build=` and `fresh=` lines. Behavior: docs-only skip for PRs and pushes, native-input and size triggers for `fresh`, safe default (build) when the change list is unknown or empty, `workflow_dispatch` always builds.
- Unit seam: `scripts/ci-ccache-env.sh`. Output: `KEY=VALUE` lines for `GITHUB_ENV`. Behavior: resolves the ccache binary found on `PATH` into `CCACHE_BINARY`, keeps the existing cache settings, fails with a clear message when ccache is missing.
- Integration seam: none beyond these two scripts. The workflow YAML is parsed for syntax and each `run` block is checked with `bash -n`.
- Not unit-testable (verified by local experiment and, later, real runs): job step ordering, `actions/cache` keys and scopes, the recovery path, timing outcomes.

Both scripts are exercised through `bun run test:unit` by spawning them with fixed inputs and asserting on their output only.

## Acceptance criteria (ticket #14, with current status)

- [ ] Bun packages cached in both jobs with one-time retry (implemented in #16, unchanged).
- [ ] Build uses ccache with native-input keys, and ccache demonstrably serves hits on a warm build (locally proven; CI proof needs a run).
- [ ] Large native change skips fallback restore (implemented in #16; planning logic now unit-tested).
- [ ] Failing cached build deletes the cache generation and retries once (implemented in #16; never run).
- [ ] Manual reset by `clean_cache` input or `NATIVE_CACHE_VERSION` (implemented in #16).
- [ ] Docs-only PRs and pushes skip the macOS build and pass (PR logic implemented, push logic new, both unit-tested).
- [ ] Before/after timings from real GitHub runs recorded on the ticket (cannot be completed without a pushed branch).

- [ ] Accessibility: not applicable (no UI).
- [ ] Failure behavior: an unknown change list builds; a missing ccache fails the configure step with a clear message; the report step never fails the job.

## Vertical slices

1. Failing test: docs-only change set yields `run_build=false`. Extract the script from the workflow.
2. Failing test: native inputs or more than 150 files yield `fresh=true`; dispatch with `clean_cache` yields `fresh=true`.
3. Failing test: docs-only `push` yields `run_build=false`; unknown change list yields `run_build=true`.
4. Failing test: ccache environment script exports the resolved binary and errors when absent.
5. Wire both scripts and the job summary into the workflow; validate YAML.
6. Local measurement (cold, warm) and docs update.

## Validation

- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test:unit`
- [ ] `bun run test:integration`
- [ ] `bun run validate`
- [ ] Local ccache cold/warm measurement recorded in `docs/testing.md`
- [ ] Full diff self-review and two-axis review
- [ ] Documentation updated

## Rollback and risks

- Caches are disposable. Bumping `NATIVE_CACHE_VERSION` or reverting the workflow restores the previous behavior; no data or schema is involved.
- Risk: ccache serving a stale object. Mitigated by content hashing (`CCACHE_COMPILERCHECK=content`) and the existing recovery step.
- Risk: engagement is proven on this Mac with Xcode 26.6 (the runner's version) but not on the runner itself until a workflow run happens. The job summary warning makes a silent regression visible. Xcode's native compilation caching is the documented fallback if ccache hit rates disappoint on CI.
- Risk (realized and reverted): booting the simulator during the MuPDF build slowed both on the 3-core runner.
- ADR 0001: nothing here uploads or distributes MuPDF output; the gate test must still pass.
