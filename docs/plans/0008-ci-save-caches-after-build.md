# Implementation plan: save iOS CI caches after the build (#25)

## Outcome

The iOS Maestro workflow saves its ccache, CocoaPods and Bun caches as soon as the work they cache has succeeded, so a later failing step (a flaky Maestro flow) no longer discards them.

## Required context read

- [x] `docs/constitution.md`, `docs/architecture.md`, `docs/requirements.md`
- [x] `docs/testing.md` (CI caching section), `docs/plans/0007-ci-build-caching.md`, `docs/agents/issue-tracker.md`
- [x] Skills: code-review. `tdd`, `codebase-design` and `domain-modeling` do not apply: no module seam or domain term changes, and workflow wiring has no unit seam (see below).

## Evidence

On `develop` run 37275739999 (the first push run after #23) the build succeeded and ccache stored 0.4 GB, but the `import-large` Maestro flow failed. `actions/cache` saves in its post step only when the whole job succeeded, so all three post-job saves were skipped and `develop` stayed without a cache. Feature PRs restore from the `develop` scope, so they stay cold. `import-large` also failed on two of the three manual runs of #23's branch, so a failing Maestro flow after a good build is not rare.

## Scope

### Included

- Replace each `actions/cache` step in `e2e-ios.yml` with `actions/cache/restore` plus an explicit `actions/cache/save` placed right after the work it caches: Bun after `bun install`; ccache and CocoaPods after a successful build (including a successful recovery rebuild).
- Scope the recovery step's cache deletion to the current ref (`gh cache list --ref "$GITHUB_REF"`), found in review: unscoped, a pull request job deleted `develop`'s shared cache, and its replacement was saved under the PR merge ref, which `develop` and other PRs cannot read.
- Save after a successful recovery even when the primary key was an exact hit. Recovery deletes that key first, and the restore step's `cache-hit` output would otherwise suppress the save (the known gap recorded in `docs/testing.md`).
- Keep keys, restore-keys, paths, pinned action SHA and `fresh` handling unchanged. Save steps reuse each restore step's `cache-primary-key` output instead of recomputing `hashFiles`, because `scripts/build-mupdf.sh` writes `MuPDF.xcframework` into `modules/`, which the ccache and Pods keys hash (found in review: a recomputed key would differ from the restored one).
- Update `docs/testing.md`.

### Excluded

- The `ci.yml` validate job (it fails the job when validation fails, so a lost Bun cache there costs seconds).
- The flaky `import-large` flow (separate task) and the other #25 criteria (docs-only skip, recovery proof, `clean_cache`).

## Seams and tests

- Unit seam: none. The change is conditional step wiring in YAML, with no script logic of its own. The agreed seams for CI work are the two scripts under `scripts/`, which are unchanged.
- Static checks: YAML parses and every `run` block passes `bash -n`.
- Evidence: the pull-request run log must show `Cache saved with key: ccache-...` before the Maestro step starts. A later run that restores that cache proves the round trip.

## Acceptance criteria

- [ ] A build that succeeds and then fails in Maestro still leaves the ccache, CocoaPods and Bun caches saved.
- [ ] A restore with an exact key hit does not try to save again (no duplicate-key warning), except after a recovery rebuild.
- [ ] After a recovery rebuild the deleted cache generation is saved again.
- [ ] Accessibility: not applicable (no UI).
- [ ] Failure behavior: when the build fails and recovery fails, the ccache and CocoaPods caches are not saved (the Bun cache is, since it is saved right after install and does not depend on the build).
- [ ] Performance budget: not applicable to the app; the CI effect is measured in the run log (caches saved before Maestro starts). Native or vertical-slice sections of the template do not apply to workflow wiring.

## Validation

- [ ] `bun run validate`
- [ ] YAML and `bash -n` checks
- [ ] Pull-request run log shows the ccache save before Maestro
- [ ] Standards and Spec review
- [ ] `docs/testing.md` updated

## Rollback and risks

- Caches are disposable; reverting the workflow restores the previous behavior. `NATIVE_CACHE_VERSION` invalidates everything.
- Risk: a save that runs before the job finishes stores a cache from a build whose later steps fail. That is intended: the cache is the compile output, not the test result, and ccache is content-addressed.
- Risk: restore and save keys must be the same value, not only the same expression. The save steps use the restore step's `cache-primary-key` output for that reason.
- Cost: a PR run now saves caches under its merge ref even when Maestro fails; these entries are not shared and count against the 10 GB quota until they age out.
