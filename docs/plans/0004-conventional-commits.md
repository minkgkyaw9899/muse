# Conventional Commits checker plan

## Outcome

Every commit entering `develop` or `main` through a pull request or push has a Conventional Commits message. The check uses GitHub Actions, not EAS Build.

## Required context read

- [x] `docs/constitution.md`, `docs/architecture.md`, `docs/requirements.md`
- [x] `CONTEXT.md`
- [x] Matt Pocock `tdd`, `writing-for-agents`, and `code-review` skills

## Public seam and acceptance criteria

The seam is the repository's commit history and `bun run lint:commits` CLI. Check the PR base-to-head range or push before-to-head range, rather than only the synthetic merge commit.

- [x] A valid `type(scope): description` message passes locally.
- [x] An invalid message fails locally.
- [x] CI is configured to check all commits on PRs to and pushes on `develop`/`main` (live PR verification pending).
- [x] The rule is documented for contributors and agents.
- [x] No EAS build is triggered.

## Implementation

1. Add commitlint and conventional config as development-only dependencies.
2. Add a CI job using full Git history and event-specific commit ranges.
3. Run red/green CLI examples, repository validation, and a real PR check.
4. Review the diff and update operational documentation.

## Risk and rollback

An incorrect range can miss commits or reject a synthetic merge message. Test both PR and push ranges and keep the checkout unshallow. Remove the job/config/dependencies if it cannot inspect real PR commits reliably.

## Validation record

- [x] Invalid message fails; valid message passes.
- [x] Existing feature commit range passes.
- [x] `bun run validate` and `bun audit --audit-level=high` pass.
- [x] `actionlint` passes for CI and security workflows.
- [ ] GitHub PR check passes.
