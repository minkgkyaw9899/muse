# Muse product requirements

## Product goal

Muse is a private, ad-free, offline-first reading app whose primary advantage is responsive navigation through unusually large or expensive-to-render PDFs. iOS is the first-class platform. Android remains buildable, but feature parity is not required until the iOS reader is proven.

## Primary user journey

1. The reader imports one or more PDFs through the iOS Files interface.
2. Muse copies each file into app-managed storage, validates it, and adds it to the Library.
3. The reader opens a publication at its saved reading position.
4. The reader chooses horizontal paginated or vertical continuous reading.
5. The reader navigates without visible stalls, jumps to a page, searches text, or manages bookmarks.
6. Muse restores the same reading position and publication-specific state on the next launch.

## Functional requirements

### Library

- Import one or multiple PDF files from system document providers.
- Use a Library, Favorites, and Settings shell, with Library first. On supported iOS 26+, add a separate native Search tab with an integrated bottom search field; elsewhere place Search before + in the Library header. Opening Library search replaces the title and actions with the input and Cancel row using a short slide; Cancel clears the query and restores the header. Skip the transition under Reduce Motion.
- Show up to three recently opened publications, ordered by last-opened date; never-opened imports do not appear in Recent.
- Show all publications in a compact list with title, page count, and last-opened or import date. Each row opens the publication when the Reader is available and has a menu for rename, favorite/unfavorite, and removal.
- Filter Library publications by displayed title as the reader types, ignoring capitalization.
- Sort the Library by recently opened, recently imported, title A–Z, or title Z–A, with reverse order where useful. Recently imported uses import date; recently opened uses last-opened date.
- Rename only the displayed title; trim it and reject blank titles, leaving the owned PDF filename unchanged. Preserve the draft when saving fails. The three-dot row menu exposes rename, favorite/unfavorite and removal with publication-specific labels. Single removal requires confirmation naming one publication and deletes only its owned source, metadata and derived cache; interrupted cleanup resumes on relaunch.
- Support multi-selection, Select all for the currently visible filtered list, and removal with a confirmation that states the number of publications affected.
- Provide a Favorites tab with the same compact rows and case-insensitive displayed-title search. Favorite/unfavorite actions in either collection persist per publication and update the other collection. Failed saves retain the committed state and explain how to retry. Loading and failed-loading states are distinct from empty and no-match states. Opening becomes functional with the Reader. A favorite marks a publication, not a page bookmark. Expose a labeled heart shortcut with selected state and a 44-point touch target in each row.
- Show a bold + import action on the right of the Library title row, with an accessible Import PDFs label and a minimum 44-point touch target. On iOS below 26 and Android, place compact background-free Search, +, and pencil Edit icons to the right of Library on the same row, each with a 44-point touch target. On supported iOS 26 use a pencil Edit icon after + in a compact Liquid Glass circle. Edit enters selection mode; disable it while loading, importing, selecting, or when the collection is empty. Native Search also offers a pencil Edit icon for matching results. Make this primary action open the system Files picker for multiple PDFs. Report the outcome in one toast (success, duplicate, or an actionable failure) with no in-screen progress, results list, or Cancel control, and keep the action disabled while an import runs. Bound active imports; leaving the screen cancels remaining work while preserving completed publications.
- Store title, source filename, byte size, page count, import date, last-opened date, reading position, and a stable content fingerprint.
- Show import, validation, duplicate, missing-file, corrupt-file, encrypted-file, and unsupported-file states.
- Remove a publication and its derived cache without affecting other publications.
- Operate without an account, advertisements, analytics, or network access.

### Reader

- Open very large PDFs without constructing one JavaScript object or view per page.
- Support horizontal paginated and vertical continuous reading modes.
- Jump to a validated one-based page number while storing zero-based page indexes internally.
- Restore the last reading position per publication.
- Add, list, jump to, rename, and delete bookmarks per publication.
- Search extractable PDF text, show incremental results, cancel search, and jump to a result.
- Expose loading, rendering, unavailable-text, password-required, corrupt-document, and out-of-memory recovery states.
- Preserve zoom and navigation behavior without blocking the JavaScript or main UI thread.

### Appearance

- Provide Settings for System, Light, and Dark app themes. Reader-specific reading mode and page background controls become functional with the Reader; planned page background choices are Automatic, Light, Dark, and Woody.
- Tab bar: on iOS 26+ (both `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` true) use the native Liquid Glass tab bar with filled active icons and a short SF Symbol bounce when the selected tab changes (skipped under Reduce Motion). The cosmetic effect also skips safely if UIKit exposes no unique icon target. Elsewhere use the custom JS tab bar: filled, bold active icon in the accent color and a short bounce on selection (skipped under Reduce Motion). The selected icon and label share the `accentText` token in both designs, so the label meets 4.5:1 text contrast. Both use the same primary destinations, labels, and tokens. On supported iOS 26+, the additional Search tab uses the system search role; minimize the native bar on downward scrolling and restore it on upward scrolling, retaining the full bar under Reduce Motion.
- Selection in lists is shown with icons (leading option icon, trailing check), not text labels; back buttons are icon-only.
- Provide About and Share actions when their content is ready. Terms & Conditions requires approved text, and Rate us requires a store listing destination.
- Use a clean, restrained interface following an approximate 60/30/10 distribution:
  - 60% canvas/background: light `#F3F0EB`, dark `#1A1714`
  - 30% surfaces and secondary areas: light `#EAE3DA`, dark `#26221E`
  - 10% accent, selected states, and active icons: light `#A3714A`, dark `#D9A77E`
  - small accent text and the active tab icon/label pair (`accentText`, 4.5:1): light `#7E5839`, dark `#D9A77E`
  - text: light `#1F1B17`, dark `#F1ECE6`; a soft, warm palette rather than pure black or white
- Centralize semantic tokens; raw palette values may appear only in the theme definition (`src/theme/tokens.ts`) and its Uniwind mirror in `src/global.css`, which a unit test keeps identical.
- Follow React Native Reusables component patterns implemented with Uniwind/Tailwind CSS.
- On iOS 26+, use Liquid Glass selectively for navigation and floating controls when runtime capability checks pass.
- On iOS below 26 and unsupported environments, render an intentional opaque/translucent fallback with identical behavior and accessibility.
- Support light/dark accessibility contrast, Dynamic Type, VoiceOver labels, 44-point minimum touch targets, and Reduce Motion.

## Performance requirements

The target corpus must include tiny PDFs, image-heavy scans, malformed files, password-protected files, and synthetic documents approaching 100,000 pages.

- Opening cost must scale with work needed for the first viewport, not total page count.
- Rendering uses bounded background workers and cancellation; stale work never outranks the visible page.
- Keep the visible page plus a small adaptive window of adjacent pages warm. The initial policy is current page, two pages ahead, and one page behind; measurement may change it.
- Use memory and disk caches with explicit byte budgets and least-recently-used eviction.
- Cache keys include content fingerprint, page index, pixel dimensions/scale, color mode, and renderer version.
- Never serialize page bitmaps through JSON/Base64 or keep unbounded decoded images in JavaScript memory.
- Performance changes require before/after measurements on a named device and fixture; intuition alone is not acceptance evidence.

Initial targets, to be calibrated after the native spike:

- first useful page rendition within 1.5 seconds for a representative local PDF on the baseline device;
- visible-page render scheduling within 50 ms of a navigation request;
- no sustained main-thread stalls above 100 ms during steady navigation;
- no cache growth beyond configured disk and memory budgets.

## Compatibility and constraints

- Expo SDK 57, React Native 0.86, React 19.2, iOS 16.4 minimum.
- Lists and scroll views use `@legendapp/list` 3.6 (MIT, peer dependency `react` only) through `src/ui/scroll-list.tsx`. Compatibility with this SDK is evidenced by the typecheck, the rendered tests, and installed-app flows on the iOS 26.5 simulator, including native tab minimization.
- Development builds only; Expo Go is unsupported.
- Root native projects are generated with CNG.
- Imported files are app-local copies. Arbitrary persistent filesystem paths are not a cross-platform contract.
- PDF is milestone one. EPUB/AZW/Kindle DRM formats are out of scope. A Kindle-like experience means paginated navigation and reader ergonomics, not DRM bypass or guaranteed PDF text reflow.
- MuPDF is not approved for distribution until AGPL compliance or a commercial license is chosen.

## Delivery milestones

1. Foundation: architecture, validation, CI, development builds, test harness.
2. Native spike: open one PDF, report metadata, render one page, measure memory and latency.
3. Library: import, copy, fingerprint, persist, list, delete.
4. Reader core: paginated mode, jump, position restore, native scheduler and cache.
5. Continuous mode, bookmarks, and text search.
6. Liquid Glass/fallback design system, accessibility, and performance hardening.
7. Store readiness, licensing evidence, privacy manifest, crash recovery, and release automation.

## Release channels

- Beta builds and prereleases come from `develop`; stable releases come from `main`.
- Public versions use three numeric parts, `MAJOR.MINOR.PATCH`. Beta tags add a prerelease suffix, such as `vMAJOR.MINOR.PATCH-beta.N`; stable tags use `vMAJOR.MINOR.PATCH`.
- Publish GitHub Releases only when the corresponding branch is validated and release-ready. Do not infer a release version from the current starter package version.
- The Beta (develop) and Stable (main) GitHub Project views track work for each channel. MuPDF distribution still requires the accepted licensing path in ADR 0001.

## Definition of done

A feature is done only when its acceptance criteria pass, the validation loop in `AGENTS.md` is green, relevant performance evidence is captured, the full diff is reviewed, and affected documentation is updated.
