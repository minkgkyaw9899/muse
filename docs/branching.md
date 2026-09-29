# Branch and pull request workflow

`main` is the production branch. `develop` is the development integration branch. Both are long lived. New feature work starts from the current `develop` tip and uses `feature/<snake_case_name>` in an isolated Git worktree.

## Feature flow

1. Update local `develop` from `origin/develop`.
2. Create a worktree and branch: `git worktree add -b feature/<snake_case_name> <worktree-path> develop`.
3. Read the required project docs, write a plan, implement the smallest slice, and run the `AGENTS.md` validation loop. Run relevant Maestro flows on a built app for UI or native behavior.
4. Review the diff, commit on the feature branch, and push that branch.
5. Open a pull request with base `develop` and head `feature/<snake_case_name>`. Include validation results and any Maestro build/run links. Do not merge before required checks pass.
6. Remove the local worktree with `git worktree remove <worktree-path>` after the PR is prepared. Keep the remote branch until the PR is merged.

## Release flow

Promote tested development work through a pull request from `develop` into `main`. Never commit or push feature work directly to `main`. Require passing checks and review on the PR. Configure GitHub branch protection for `main` to disallow direct pushes and require PRs; configure `develop` to require validation on feature PRs.

The initial creation of the remote `main` branch may point to the repository's existing starter commit. It contains no feature changes. After bootstrap, all production changes use the release PR flow.
