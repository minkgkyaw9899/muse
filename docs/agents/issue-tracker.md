# GitHub issue tracker

Muse tracks specs and implementation tickets in GitHub Issues and groups the current work in the [Muse development project](https://github.com/users/minkgkyaw9899/projects/1). Its [Beta (develop)](https://github.com/users/minkgkyaw9899/projects/1/views/2) and [Stable (main)](https://github.com/users/minkgkyaw9899/projects/1/views/3) views filter the Release channel field. Use the repository named by `git remote`.

## Ticket lifecycle

1. Before starting a ticket, read its body, blockers, and comments. Work only when blockers are closed.
2. Mark the ticket in progress when implementation begins.
3. Post a concise progress comment when a completed slice or material decision changes the ticket's state. Keep acceptance criteria accurate.
4. Link the PR in the issue's GitHub Development panel when opened and update the project status to In Review. Keep the ticket open while the PR is open or if it closes without merging. A closing keyword alone does not create the link when a PR targets `develop` rather than the repository's default branch.
5. Close the ticket after the PR merges, its acceptance criteria pass, and Muse's required validation is green. Update the GitHub Project to done.
6. Keep the GitHub Project status aligned with the issue. Update a blocked ticket when its blocker changes.

Specs remain open as reference until their related tickets are complete. Do not copy issue state into repository docs.

## Release tracking

- Assign each ticket to its owner, milestone, and GitHub Project release channel when creating it. The current channel views are Beta (develop) and Stable (main).
- Link a development branch to its ticket as soon as the branch exists; link every implementation PR in the issue's Development panel when opened. Create branches for actual work, not for planning tickets. GitHub only applies closing keywords automatically to PRs targeting the default branch, so close tickets manually after a `develop` merge and acceptance check.
- Beta prereleases use `develop` and tags shaped `vMAJOR.MINOR.PATCH-beta.N`. Stable releases use `main` and tags shaped `vMAJOR.MINOR.PATCH`. Choose the numeric version when preparing a release.
- Publish each GitHub Release after validation and release readiness are confirmed. MuPDF-containing distributions require the accepted licensing path in ADR 0001.

## Scrum board

The Project Status field uses Backlog, Ready, In Progress, In Review, Blocked, and Done. Backlog items need refinement; Ready items have clear acceptance criteria and no open blockers. Use Blocked when a named dependency or decision prevents work. Move an item to In Review while its PR or acceptance review is active. Done requires a merged PR and passing acceptance criteria.

The Sprint field has two-week iterations beginning Monday, 2026-09-28. Assign work to a sprint when committing to that iteration; leave future backlog items without a sprint. Keep the Beta (develop) and Stable (main) release views distinct from sprint planning.
