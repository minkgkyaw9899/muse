# GitHub issue tracker

Muse tracks specs and implementation tickets in GitHub Issues and groups the current work in the [Muse development project](https://github.com/users/minkgkyaw9899/projects/1). Its [Beta (develop)](https://github.com/users/minkgkyaw9899/projects/1/views/2) and [Stable (main)](https://github.com/users/minkgkyaw9899/projects/1/views/3) views filter the Release channel field. Use the repository named by `git remote`.

## Ticket lifecycle

1. Before starting a ticket, read its body, blockers, and comments. Work only when blockers are closed.
2. Mark the ticket in progress when implementation begins, and create its branch with `gh issue develop <n> --name <feature/name> --base develop`. Name it `feature/<name>` or `codex/<name>`: the `branch-policy` check rejects any other head branch for a PR into `develop`. The ticket's Development panel then lists the branch from the start. Set the ticket's Release channel and Sprint as well.
3. Post a concise progress comment when a completed slice or material decision changes the ticket's state. Keep acceptance criteria accurate.
4. Open the PR with the [pull request checklist](#pull-request-checklist) complete and update the project status to In Review. Keep the ticket open while the PR is open or if it closes without merging.
5. Close the ticket after the PR merges, its acceptance criteria pass, and Muse's required validation is green. Update the GitHub Project to done.
6. Keep the GitHub Project status aligned with the issue. Update a blocked ticket when its blocker changes.

Specs remain open as reference until their related tickets are complete. Do not copy issue state into repository docs.

## Pull request checklist

Set all of it when opening the PR, then read each value back before calling the PR ready.

1. **Title and base.** Conventional Commits 1.0.0 title; base `develop` for feature work.
2. **Metadata.** `gh pr create --label <labels> --project "Muse development" --milestone "<ticket milestone>" --assignee <owner>`. Choose labels from the ticket's type (`enhancement`, `testing`, `documentation`, `bug`).
3. **Project fields.** `--project` only adds the item. Set Status (In Review), Release channel, and Sprint (the iteration containing today) on the PR's project item and on the ticket with `gh project item-edit`. Fetch field and option ids with `gh project field-list 1 --owner minkgkyaw9899`.
4. **Development link.** A branch created by `gh issue develop` is listed in its ticket's Development panel. The PR's own Development section takes issues only through its sidebar gear: closing keywords and a linked branch leave it empty for a PR into `develop`, and no API mutation creates the link. Use the sidebar gear to select the existing ticket, then verify it appears in the PR Development section. If browser access prevents linking, tell the owner the blocker in the same message and keep PR setup incomplete until the link is verified.
5. **Auto-fix.** Bind the PR to the session and turn on auto-fix with review-comment handling.

## Release tracking

- Assign each ticket to its owner, milestone, and GitHub Project release channel when creating it. The current channel views are Beta (develop) and Stable (main).
- Create branches for actual work, not for planning tickets. GitHub applies closing keywords only to PRs that target the default branch, so close tickets manually after a `develop` merge and acceptance check.
- Beta prereleases use `develop` and tags shaped `vMAJOR.MINOR.PATCH-beta.N`. Stable releases use `main` and tags shaped `vMAJOR.MINOR.PATCH`. Choose the numeric version when preparing a release.
- Publish each GitHub Release after validation and release readiness are confirmed. MuPDF-containing distributions require the accepted licensing path in ADR 0001.

## Scrum board

The Project Status field uses Backlog, Ready, In Progress, In Review, Blocked, and Done. Backlog items need refinement; Ready items have clear acceptance criteria and no open blockers. Use Blocked when a named dependency or decision prevents work. Move an item to In Review while its PR or acceptance review is active. Done requires a merged PR and passing acceptance criteria.

The Sprint field has two-week iterations beginning Monday, 2026-09-28. Assign work to a sprint when committing to that iteration; leave future backlog items without a sprint. Keep the Beta (develop) and Stable (main) release views distinct from sprint planning.
