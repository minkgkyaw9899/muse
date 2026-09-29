# Security and code quality checks plan

## Outcome

Pull requests and pushes for `develop` and `main` run reproducible code-quality and security checks without using EAS Build minutes.

## Required context read

- [x] `docs/constitution.md`
- [x] `docs/architecture.md`
- [x] `docs/requirements.md`
- [x] `CONTEXT.md`
- [x] Matt Pocock `tdd`, `writing-for-agents`, and `code-review` skills

## Scope

- Run the existing Biome, TypeScript, and Jest validation on pushes to both long-lived branches and PRs targeting either branch.
- Audit the locked Bun dependency graph for high/critical advisories.
- Analyze JavaScript and TypeScript with CodeQL's security-and-quality queries.
- Document how to interpret and maintain the checks.

No EAS builds, runtime app changes, package additions, or native code are included.

## Public seam and acceptance criteria

The public seam is the GitHub Actions workflow: a PR or push to either long-lived branch schedules validation, audit, and CodeQL jobs. The checked-in workflow and a real GitHub PR run are the evidence; no mock of GitHub Actions is used.

- [x] Both branches are covered by quality and security triggers.
- [x] Biome, TypeScript, Jest, and the Bun lockfile remain quality gates.
- [x] High/critical dependency advisories fail the audit job.
- [ ] CodeQL uploads JavaScript/TypeScript security and maintainability findings (verify on PR).
- [x] Actions are pinned and granted minimum permissions.
- [x] No EAS workflow or build is triggered.

## Validation

- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test:unit`
- [x] `bun run test:integration`
- [x] `bun run validate`
- [x] `bun audit --audit-level=high`
- [x] Local workflow syntax/static checks (`actionlint` 1.7.12)
- [ ] PR checks
- [ ] Full diff review and documentation update

## Rollback and risks

Remove the new security workflow and restore the prior CI trigger if CodeQL cannot run in the public GitHub repository. CodeQL reports findings but its job may still succeed when findings exist; treat alert review as an explicit follow-up rather than claiming a fail-closed gate. GitHub Actions minutes, not EAS build minutes, are consumed.
