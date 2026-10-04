# Implementation plan: rename and remove one publication (#10)

## Outcome

A reader can open a labeled three-dot row menu in Library or Favorites, rename the displayed title, or confirm removal of exactly one identified publication.

## Required context read

- [x] Constitution, architecture, requirements, CONTEXT and ADR 0002
- [x] Testing, branching and issue-tracker instructions; #10, its parent #3 and closed blocker #6
- [x] Implement, codebase-design, TDD, domain-modeling reference, native UI and PR skills
- [x] Expo SDK 57 reference and relevant filesystem/SQLite references; React Native Modal/Alert

## Scope

Include durable title-only rename, three-dot actions including favorite/unfavorite, single-publication removal confirmation, isolated source/cache cleanup, interruption recovery and cross-collection updates. Exclude Reader opening, batch selection/removal, Recent and sorting.

## Seams and tests

The parent spec explicitly agrees on the public Library interface and rendered screen interface. Extend that same seam with `rename(id, title)` and `remove(id)`, returning safe result values. Integration tests use in-memory adapters and the production SQLite adapter with real host SQLite. Screen tests exercise menu labels, drafts, confirmation, cancel, errors and synchronization. Maestro exercises installed-app rename/search/relaunch and confirmed removal.

## Acceptance criteria

- [x] Rename changes only displayed title; blank titles are rejected and failed saves preserve the draft.
- [x] The three-dot row menu exposes labeled rename, favorite/unfavorite and removal actions.
- [x] Confirmation identifies exactly one publication; cancellation leaves it intact.
- [x] Removal deletes only its source and cache; committed removal survives interruption and retries cleanup.
- [x] Actions work in both collections, with pending/failed states, 44-point targets and readable large text.
- [ ] Tests, required validation, installed-app flows and two-axis review pass.

## Vertical slices

1. Failing rename behavior test, minimal durable metadata update and safe title validation.
2. Failing removal/recovery behavior test, schema-3 pending cleanup records and bounded cleanup.
3. Failing rendered menu/rename test, shared actions and retained drafts on failure.
4. Failing confirmation/cancellation and cross-collection tests, minimal removal UI.
5. Installed-app acceptance, full validation, reviews and a combined #9/#10 PR into develop.

## Performance and rollback

No PDF inspection or page materialization. Metadata changes use the existing serialized write queue. Removal commits a cleanup record and removes the visible row in one transaction, then deletes the source and its `cache/renditions/<publication-id>/` directory. Startup drains remaining cleanup records before reconciliation. Schema 3 is additive and preserves schema-1/2 publications; older application versions reject it. Source removal cannot be undone after confirmation. No new packages or native project changes; MuPDF distribution remains blocked by ADR 0001.

## Validation

- [x] Lint, typecheck, unit, integration and UI — `bun run validate` passed: 51 unit, 103 integration and 34 UI tests; Biome checked 95 files.
- [ ] Relevant Maestro flows on installed iOS app — current bundle was rebuilt, signed and installed; the automation runner was terminated by the host approval service before an assertion result.
- [x] Combined validation — `bun run validate` passed after the final import/removal regression.
- [x] Standards and Spec reviews; findings addressed — reviews found stale import replay, cleanup recovery and iOS error announcement gaps; each now has regression coverage and a correction.
- [x] Architecture, requirements and testing notes
- [ ] Commit and prepare combined PR, verify metadata and both Development links

## Tracker

Continue `codex/issue-9-favorites` because the owner requested one PR for #9 and #10. Both tickets remain open until merge and passing acceptance. Set #10 In Progress now, then both In Review when opening the combined PR.
