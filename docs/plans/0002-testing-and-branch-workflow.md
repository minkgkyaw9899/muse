# Testing and branch workflow plan

## Goal

Make Jest, React Native Testing Library, and Maestro the project test stack. Record and apply the Git branch flow: stable `main`, beta integration `develop`, and an isolated worktree per feature.

## Public seams

- TypeScript domain and application behavior is tested through exported interfaces with Jest.
- React Native behavior is tested through rendered text, roles, and interactions with React Native Testing Library.
- Installed app behavior is tested on a simulator with Maestro using visible UI and stable test IDs.

## Smallest complete slice

1. Add a rendered UI test for an existing starter component to prove the React Native test harness works.
2. Add an iOS simulator smoke flow for the current app and a GitHub Actions native build and Maestro workflow.
3. Provide local commands and CI triggers for the three test layers.
4. Document branch creation, PR targets, release flow, and worktree cleanup in `AGENTS.md` and contributor docs.
5. Install Lefthook for staged Biome fixes and whitespace checks before commit, then run full validation before push. Keep CI validation as the remote merge gate and remove duplicate Biome work from the combined command.

## Validation

- `bun run lint`, `bun run typecheck`, `bun run test:unit`, `bun run test:integration`, and `bun run validate` pass.
- Expo Doctor passes.
- EAS validates the changed JavaScript workflow with server-side validation.
- The Maestro flow passes on an installed iOS 26.5 simulator using a local Xcode 27 Release build. The iOS 27 simulator fails to start Maestro's XCUITest driver; CI therefore uses an iOS 26.5 simulator.
- Review the diff and prepare a PR from `feature/testing_workflow` to `develop`.
- Lefthook 2.1.14 configuration validates, and its MIT license is compatible with development tooling. It runs under Bun without changing Expo SDK interfaces.

## Constraints

- Native code requires a development or standalone build; Expo Go is outside this test path.
- GitHub's macOS runner consumes Actions minutes. EAS automatic jobs are disabled to preserve build allowance for requested beta and stable builds. No workflow run is triggered as part of YAML validation.
- Main is created from the pre-feature starter commit; feature work never lands there by direct push.
