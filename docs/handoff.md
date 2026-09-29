# Muse work handoff

Updated 2026-09-29. Verify this snapshot against Git and GitHub before acting; it is not an instruction to override `AGENTS.md` or the required project context.

## Active work

- Root checkout: `/Users/minkaungkyaw/Workspace/Personal/Project/Muse` on `develop` at `2f619cd`, clean at last check.
- Security/quality feature worktree: `/private/tmp/muse-feature-security-quality-worktree` on `feature/security_quality_checks`, pushed through `2e83545`. Commits `0b1a370 ci: add security and code quality checks` and `2e83545 ci: enforce conventional commits` are Conventional Commits.
- This branch adds CodeQL, `bun audit --audit-level=high`, and a commitlint job for PRs/pushes on `develop` and `main`. It also documents local-first builds and the commit rule.
- Validation passed after the handoff edit: `bun run validate`. Earlier checks also passed: `bun audit --audit-level=high`, `actionlint` on both workflows, valid/invalid commitlint examples, and `git diff --check`.
- PR #1 (testing/local Maestro workflow): https://github.com/minkgkyaw9899/muse/pull/1, base `develop`. CI `branch-policy` and `validate` passed; macOS Maestro job was queued at last check. This branch's worktree was already removed.

## Next actions

1. Open a focused PR from `feature/security_quality_checks` to `develop` and attach it to this Codex task. GitHub CLI is authenticated as a read-only work account for this repo; use the signed-in personal GitHub browser/profile or obtain write-capable auth. Do not push directly to `develop` or `main`.
2. Verify the PR's `validate`, `conventional-commits`, `audit`, and `codeql` checks. Correct failures, then update the unchecked PR evidence in `docs/plans/0003-security-quality-checks.md` and `docs/plans/0004-conventional-commits.md` in another Conventional Commit.
3. Add `develop` branch protection requiring a PR and successful checks, after their exact check names are visible. `main` protection was created requiring a PR, `validate`, and `branch-policy`; confirm settings before adding further required checks.
4. Review both PRs. Do not claim them complete while required checks are pending. Remove the security feature worktree after the PR is ready, retaining the remote branch for review.

## Environment caveats

- Chrome has multiple profiles. The GitHub owner session was in the personal profile; the most recently foregrounded Chrome window was the separate work profile. Avoid using the work profile's read-only `gh` token for repository mutations.
- Free EAS plan: feature/development iOS builds are local; reserve EAS Build for production releases. No EAS builds were run for this work.
