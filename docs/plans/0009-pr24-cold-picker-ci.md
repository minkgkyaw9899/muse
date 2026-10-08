# Implementation plan: PR 24 cold Files readiness

## Outcome

All required GitHub checks pass on the exact PR head. Installed import flows wait for the Files picker to become ready on a cold simulator before tapping Browse.

## Required context read

- [x] Constitution, architecture, requirements, testing, branching and issue tracker
- [x] CONTEXT and existing owned-storage ADR; no domain or architectural changes
- [x] Diagnosing-bugs, TDD and code-review

## Scope

Fix only picker-entry synchronization in Maestro. Keep every import, persistence, favorite, rename and removal assertion. No app behavior, dependency, build-cache, retry-whole-suite or native-project changes.

## Seams and tests

Reuse the already agreed installed-app seam. Run 37393962839 is red on the first `import-one.yml` Browse assertion, reached through favorites. Its captured hierarchy subsequently contains Files Recents and Browse; all later flows pass, including the previously failing renamed menu. This cold CI path is authoritative and takes minutes; a Jest imitation cannot reproduce system Files readiness.

## Acceptance criteria

- [x] Every picker entry waits at most 60 seconds for Browse, then taps it.
- [x] Durable import and publication-action assertions remain unchanged.
- [ ] All installed flows and combined validation pass.
- [x] Standards and Spec reviews pass: zero actionable findings in either axis.
- [ ] GitHub's required checks pass on the final pushed commit.

## Vertical slice

Recorded cold-CI failure → shared bounded Browse-readiness helper → installed import/favorites flows → complete GitHub rerun. Do not call recovery complete before the remote result.

## Validation

- [x] Lint, typecheck, unit, integration, UI and combined validation: 188 tests passed.
- [ ] Full installed Maestro suite with per-flow fixture seeding, matching CI
- [ ] Review, testing notes and PR evidence updated
- [ ] Required GitHub checks green

## Rollback and risks

Test-only change. No migration, native build interface, license or product timing budget changes. Missing Browse still fails after a bounded wait; failures are not suppressed or retried as an entire suite.
