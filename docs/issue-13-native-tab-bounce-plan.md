# Implementation plan: native tab icon bounce (#13)

## Outcome

First determine whether an SF Symbol bounce can reach the visible icon in the
iOS 26 native Liquid Glass tab bar without private APIs, navigation delegate
replacement, or fragile layout assumptions. Ship a local Expo module only if
that spike succeeds; otherwise defer the cosmetic animation with evidence.

## Required context read

- `docs/constitution.md`, `docs/architecture.md`, `docs/requirements.md`
- `CONTEXT.md` and ADRs 0001/0002 (no renderer or storage changes)
- Implement, codebase-design, TDD, Expo module, and code-review skills
- Expo SDK 57 reference and documentation index; installed UIKit headers
- #13, its parent #3, and completed prerequisite #4

## Scope

Preserve Library, Favorites, Settings, their accessibility, the native bar,
and the existing custom fallback. No web implementation or reader changes.

## Seams and tests

The owner accepted the proposed approach and seam on 2026-10-07:

- If feasible, test changed-tab and Reduce Motion behavior through the local
  module's public selection input.
- Verify the actual visible bounce and native bar on an iOS 26 simulator,
  including rapid switching and Reduce Motion.
- The disposable UIKit spike checks feasibility, not Expo integration or final
  acceptance. Do not add policy-only tests as evidence of visible animation.

## Vertical slices

1. Run an isolated UIKit tab-bar probe using the same SF Symbols as Muse.
2. If the visible icon can be targeted reliably, scaffold an Apple-only local
   Expo module and follow red/green at the agreed selection seam.
3. If targeting requires fragile internals, record the evidence and defer #13
   without changing production navigation.

## Validation

Run lint, typecheck, unit tests, integration tests, and combined validation.
Review the diff on Standards and Spec axes. Commit the outcome on
`codex/issue-13-native-tab-bounce`; do not push or open a PR.

## Rollback and risks

UIKit owns the icon views; UITabBarItem exposes no public icon-view accessor.
An internal hierarchy lookup may target a hidden duplicate rather than the
visible Liquid Glass icon and may change between OS versions. Missing or
ambiguous targets must skip animation. Do not use KVC, private class names,
method swizzling, navigation delegate replacement, or a replacement glass bar.
No migration, native root-project edits, new package, or MuPDF distribution.

## Spike result

The guarded selected-image equality lookup identified one target and the
recording showed a visible bounce on iOS 26.5. Proceed with the local module.
See `docs/native-tab-bounce-spike.md` for evidence and reproduction.

The selection seam is `createNativeTabIconAnimator().select(index)` with a
native bounce adapter; the native seam is `NativeTabIconAnimator.bounce`.
JavaScript tests cover initial/repeated focus, native failure, and skips. The
standalone UIKit fixture exercises the production native selection seam.

## Implementation validation

- `bun run validate` passed: lint, typecheck, 38 unit tests, 14 integration
  tests, and formatting checks.
- The final iOS simulator development build succeeded.
- Standards review: zero required-standard violations; one optional suggestion
  to replace Swift result strings with a string-backed enum.
- Spec review: zero behavioral bugs or unrequested scope.
- iOS 26.5 fixture and development-app checks confirmed native animation and
  live Reduce Motion suppression, as documented in the spike note.
- Final rapid touch switching passed on iOS 26.5: five consecutive changes
  reached Settings, then Library, with visible icon motion and a stable bar.
- The same final native build passed iOS 18.6 fallback verification: the custom
  bar rendered, all three destinations selected correctly, and rapid switching
  returned to Library without a crash or navigation error.
