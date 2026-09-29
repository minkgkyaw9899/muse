# Security and code-quality checks

GitHub Actions runs checks on pull requests to, and pushes on, `develop` and `main`. Routine checks use GitHub Actions and local tooling, leaving the free EAS Build allowance for production releases.

| Check | Purpose | Failure behavior |
| --- | --- | --- |
| CI `validate` | Biome lint/format, TypeScript, and Jest via `bun run validate` | Fails the job on a validation error. |
| Security and Code Quality `audit` | Audit the frozen Bun dependency graph with `bun audit --audit-level=high` | Fails for high or critical published advisories. Moderate/low advisories still need review. |
| Security and Code Quality `codeql` | Analyze JavaScript/TypeScript with CodeQL's `security-and-quality` suite | Fails if analysis or upload fails. Findings appear in GitHub code scanning; a successful job does not mean zero findings. |

Before a PR, run `bun run validate` and `bun audit --audit-level=high` locally. Review new CodeQL findings on the PR or in the repository's Security and quality view. Address relevant findings, or record a specific rationale for a false positive. Never silence a finding only to turn a check green.

The workflow pins the CodeQL action to v4.38.2 and grants `security-events: write` only to its analysis job. It adds no package to the app and triggers no EAS workflow. Update the pin after reviewing a newer release and rerunning both branch checks.
