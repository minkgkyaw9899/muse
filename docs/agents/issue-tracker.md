# GitHub issue tracker

Muse tracks specs and implementation tickets in GitHub Issues and groups the current work in the [Muse development project](https://github.com/users/minkgkyaw9899/projects/1). Its [Beta (develop)](https://github.com/users/minkgkyaw9899/projects/1/views/2) and [Stable (main)](https://github.com/users/minkgkyaw9899/projects/1/views/3) views filter the Release channel field. Use the repository named by `git remote`.

## Ticket lifecycle

1. Before starting a ticket, read its body, blockers, and comments. Work only when blockers are closed.
2. Mark the ticket in progress when implementation begins.
3. Post a concise progress comment when a completed slice or material decision changes the ticket's state. Keep acceptance criteria accurate.
4. Link the PR when opened and update the project status for review. Keep the ticket open while the PR is open or if it closes without merging.
5. Close the ticket after the PR merges, its acceptance criteria pass, and Muse's required validation is green. Update the GitHub Project to done.
6. Keep the GitHub Project status aligned with the issue. Update a blocked ticket when its blocker changes.

Specs remain open as reference until their related tickets are complete. Do not copy issue state into repository docs.

## Release tracking

- Assign each ticket to its owner, milestone, and GitHub Project release channel when creating it. The current channel views are Beta (develop) and Stable (main).
- Link a development branch to its ticket as soon as the branch exists; link the PR when opened. Create branches for actual work, not for planning tickets.
- Beta prereleases use `develop` and tags shaped `vMAJOR.MINOR.PATCH-beta.N`. Stable releases use `main` and tags shaped `vMAJOR.MINOR.PATCH`. Choose the numeric version when preparing a release.
- Publish each GitHub Release after validation and release readiness are confirmed. MuPDF-containing distributions require the accepted licensing path in ADR 0001.
