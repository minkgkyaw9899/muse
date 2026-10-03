# Implementation plan: publication favorites (#9)

## Outcome

A reader can favorite or unfavorite a publication in Library or Favorites, search Favorites by displayed title, and retain the choice after relaunch.

## Required context read

- [x] `docs/constitution.md`, `docs/architecture.md`, `docs/requirements.md`
- [x] `CONTEXT.md`, ADR 0002, testing, branching and tracker instructions
- [x] implement, TDD, codebase-design, Expo Router and native UI skills
- [x] Expo SDK 57 SQLite docs and React Native accessibility docs

## Scope

Include durable publication-level `isFavorite`, accessible row actions in both collections, shared compact rows and title search, loading/error/empty states, and cross-screen updates. Reader opening, sorting/recents (#8), full row menus/rename/removal (#10), and bookmarks remain separate slices.

## Seams and tests

The issue and parent spec already agree on the public Library interface and rendered screen seams. Extend `PublicationLibrary` with `setFavorite(id, isFavorite)` (a saved publication or safe storage/not-found error) and `subscribe(listener)` (publication changes after durable writes; unsubscribe on unmount). Observe list results and visible screen state, using in-memory repository/file/picker/renderer adapters. Screen tests cover the shared actions, title search, pending/failed writes and stale snapshot suppression. SQLite migration tests run the production repository against a real SQLite test adapter and verify through the Library interface.

## Acceptance criteria

- [x] Favorite state persists per publication, independent of reading position/bookmarks.
- [x] Favorites and Library share rows and case-insensitive displayed-title matching.
- [x] Saved changes update both mounted collections; failed changes retain durable state with retry guidance.
- [x] Loading, failed loading, empty, populated and no-match states are distinguishable.
- [x] Row controls have labeled selected state, 44-point targets, and wrap for Dynamic Type.
- [x] Public-seam behavior tests, lint, typecheck and validation pass.
- [x] Relevant installed-app Maestro flow passes.

## Vertical slices

1. Import, favorite, relaunch, list: failing Library test, minimal durable state and schema migration.
2. Unfavorite, missing publication, write failures and observer changes: one behavior at a time.
3. Shared accessible row action and populated Favorites: failing rendered test, minimal UI.
4. Favorites title search, cross-collection consistency, pending/error and stale load behavior.
5. Installed-app favorite/relaunch/search/unfavorite flow and two-axis review against `c5e889d`.

## Performance and rollback

Favorite updates are a parameterized metadata write with no PDF reads or rendering. Collection filtering scales with publications; `ScrollList` bounds mounted rows independently of page count. Schema 2 adds a default-false boolean to schema 1 without changing owned files or reading metadata. Downgrading to schema-1 code requires a compatible migration policy; do not delete user metadata. No packages or native product code are added; MuPDF licensing remains governed by ADR 0001.

## Validation

- [x] Targeted tests observed red before their implementation
- [x] `bun run lint` and `bun run typecheck`
- [x] `bun run validate` (unit, integration, UI, Biome)
- [x] Relevant Maestro flow on installed simulator app
- [x] Standards and Spec reviews; findings addressed
- [x] Architecture, requirements and testing notes updated

Validation snapshot: Node 22.23.2; `bun run validate` passed 51 unit, 94 integration and 28 UI tests. Real SQLite tests cover migration rollback/retry, reopening after a failed connection attempt, and failed writes retaining committed state. A slow-write test exposed out-of-order favorite changes; favorite and import metadata writes now use one queue. Rendered tests observed the stale-read and loading-retry regressions before their fixes. Review exposed a second race: local results could invalidate a newer snapshot containing another publication’s change, including a loading retry. Fresh reads after local outcomes and preservation of returned imports fix it; save/import overtaking and retry regressions pass. A final red/green storage test verifies that a rejected connection attempt is cleared before retry.

### Standards review

The final review of `c5e889d...6162a21` and follow-up of the connection recovery correction found zero actionable findings. Module boundaries, parameterized transactions, semantic tokens, accessible controls, bounded rows and cleanup conform to the documented standards. No actionable baseline smell remains.

### Spec review

The final review and recovery follow-up found zero actionable findings. All five #9 acceptance criteria are implemented, with no scope creep. The initial refresh race findings were fixed and verified by regressions before repeat review.

### Installed-app acceptance

Favorites and smoke passed on the final production source at `a1fa1a4` (2/2 flows, 1m 42s), including Files import, relaunch persistence, mixed-case title search, unfavorite and cross-tab state. The iOS 26.5 arm64 simulator uses the existing issue-7 Release native binary with unchanged native inputs, rebundled from this branch using Expo `export:embed`, compiled with the matching Hermes compiler, ad-hoc signed and verified before installation. No generated native project files were edited. Local diagnostics remain ignored under `.cache/favorites-e2e/maestro-final-recovery/`.

## Tracker

Branch `codex/issue-9-favorites` is linked to #9 and starts at current `develop` (`c5e889d`). Keep the ticket open until a PR is merged and acceptance passes. Commit locally; push and open a PR only when requested.
