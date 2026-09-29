# Branch and pull request workflow

`main` is the stable branch. `develop` is the beta integration branch. Both are long lived. New feature work starts from the current `develop` tip in an isolated Git worktree. Use `feature/<name>` or `codex/<name>` for feature branches.

## Feature flow

1. Update local `develop` from `origin/develop`.
2. Create an isolated worktree and feature branch from `develop`.
3. Read the required project docs, write a plan, implement the smallest slice, and run the `AGENTS.md` validation loop. Run relevant Maestro flows on a built app for UI or native behavior.
4. Review the diff and prepare a focused PR with a [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) title such as `test: add UI smoke coverage`. Push and open the PR when requested. Include validation results and any Maestro build/run links.
5. Merge to `develop` only after required checks pass. Retire the worktree when no ongoing work needs it.

## Release flow

Publish beta prereleases from validated `develop` commits. Promote tested development work through a pull request from `develop` into `main`, then publish a stable release from the validated `main` commit. Require passing checks and review on the PR. Configure GitHub branch protection for `main` to require PRs and `develop` to require validation on feature PRs.

The initial creation of the remote `main` branch may point to the repository's existing starter commit. It contains no feature changes. After bootstrap, all production changes use the release PR flow.
