# Semantic theme implementation plan

## Outcome

The reader can choose System, Light, or Dark in Settings, and the chosen theme consistently colors Library, Favorites, tabs, and navigation after relaunch.

## Required context read

- [x] `docs/constitution.md`
- [x] `docs/architecture.md`
- [x] `docs/requirements.md`
- [x] `CONTEXT.md` and relevant ADRs
- [x] `codebase-design`, `tdd`, `expo-router`, `expo-design-system`, and `uniwind` skills

## Scope

### Included

- Replace parallel starter palettes with semantic light and dark tokens.
- Persist the app-wide System/Light/Dark preference.
- Apply the resolved theme to native/UI navigation, Uniwind styling, and the three tab destinations.

### Excluded

- Publication import, storage, and PDF rendering.
- Reader page backgrounds and reading modes.
- Liquid Glass controls; preserve the planned capability adapter for a later feature.

## Seams and tests

Proposed public seam, pending confirmation before the first test: a theme preference interface that loads and saves `system | light | dark`, resolves the active palette from the device scheme, and exposes the resulting semantic tokens. Test its behavior through this interface using an in-memory preference adapter. Verify route integration through the rendered Settings choice and tab appearance rather than internal helpers.

## Acceptance criteria

- [x] System follows device appearance; Light and Dark override it.
- [x] Choice survives relaunch and colors tabs, navigation, and all three destinations consistently. (Verified on iOS 26.5 and 18.6 simulators.)
- [x] Both palettes use the same semantic token names and meet accessible contrast for text and controls.
- [x] Settings choices have clear labels, selected state, and 44-point targets.
- [x] Failed preference reads fall back to System; failed writes show a recoverable error without claiming success.
- [x] Theme changes do not perform work proportional to publication or page count.

## Vertical slices

1. Failing behavior test for theme preference resolution, then minimal preference module.
2. Failing behavior test for persistence, then storage adapter.
3. Settings choice and tab integration, then user-visible verification.

## Validation

- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test:unit`
- [x] `bun run test:integration`
- [x] `bun run validate`
- [x] Full diff self-review
- [x] Documentation updated

## Rollback and risks

The preference is reversible and defaults to System. CSS and native navigation can drift if mapped separately, so they must consume the same semantic values. No migration of publication data is involved.

## Implementation notes

- Seam as proposed: `createThemePreference(store)` in `src/theme/theme-preference.ts` (`load`, `save`, `resolve`), tested with `src/testing/in-memory-preference-store.ts`.
- Persistence uses `expo-sqlite/kv-store` (no new package). `src/global.css` mirrors `src/theme/tokens.ts`; a unit test fails on drift.
- Review follow-ups: saves are sequenced so only the latest can revert the UI. The `biome.json` override disables `noDuplicateCustomProperties` for `src/global.css` only, because `@variant` blocks redeclare each token. Dark palette values, `onAccent`, and `destructive` are new design decisions to confirm with the product owner. Splash and app icon colors are untouched (out of scope).
- Settings is a list; Appearance is a separate pushed screen (`src/app/settings/` stack). Verified on the iOS 26.5 simulator, including persistence across a kill and relaunch.
- Final UI state: shared primitives in `src/ui/` (`Screen`, `ListRow`, `IconBadge`, `EmptyState`); flat icon-badge rows instead of cards; softer palette. Tab bar is the native Liquid Glass bar on iOS 26+ and the custom animated JS bar elsewhere (`src/theme/glass-capability.ts`).
- Tried and abandoned: a custom animated bar on a `GlassView` surface (Telegram-style icon animation on iOS 26). The layout broke and native tabs cannot animate icons. Follow-up ticket tracks a native-module approach.
- Not verified: the bounce animation was not observed in motion, System following a live device appearance change, and web navigation.
