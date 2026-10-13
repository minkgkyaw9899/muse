# Native tab bounce feasibility spike (#13)

## Decision

Proceed with a guarded local Expo module. On iOS 26.5, public image equality
identified one UIImageView matching the selected UITabBarItem.selectedImage,
and a screen recording showed its visible symbol bounce. Do not select by
private class name, descendant order, or inferred tab geometry.

## Fixture and observations

On 2026-10-07, a standalone UIKit probe ran on the **Muse E2E iOS 26.5**
simulator (`28384D63-3B9C-4926-8EAF-9A97E3DDAA3F`, arm64), compiled using
the installed iPhoneSimulator27.0 SDK with an iOS 26 deployment target. It
used Library, Favorites, Settings, and Muse's normal/selected SF Symbols.

Six selections (0, 1, 2, 0, 2, 1) were spaced three seconds apart. Each
sample contained 32 descendants, including six SF Symbol UIImageViews for
three tabs. Two overlapping copies per tab passed ordinary visibility
checks. That rules out visibility or geometry alone as the target guard.

A follow-up waited 500 ms after each selection and compared each UIImageView
image to the selected tab item's selectedImage using public `isEqual`.
Exactly one view matched in all six samples. Applying `.bounce` to that
unique match produced a visible animation in the native bar, verified from
recorded frames. The production module uses this identity guard and bounded
retries; it looks up the target anew for each selection. A weak reference allows
the previous effect to be stopped during rapid switching without retaining views.

The checked-in probe now exercises the production native selection seam
through `checkNativeTabBounce`: stale selection and ambiguous targets skip,
an injected reduced-motion setting skips, and the unique current selection
animates unless the real system Reduce Motion setting is enabled. Raw
results are in `docs/spikes/issue-13-ios-26.5.json`. Repeating the fixture with
system Reduce Motion enabled produced six `reduceMotion` results, recorded in
`docs/spikes/issue-13-reduce-motion.json`.

## Development-app integration

The actual Expo Router adapter initially returned `unavailable`: Expo's
development tools owned the key window, and its launcher retained a second,
detached tab controller. The final lookup inspects visible windows in active
scenes and includes only controllers with a loaded view attached to a window.
No private class checks or navigation delegate changes were needed.

The live development-app selection seam returned `animated` after switching to
Favorites. After enabling system Reduce Motion in simulator Settings without
restarting Muse, selecting Settings returned `reduceMotion`. The original
disabled motion preference was restored. Temporary diagnostic logging was
removed from the final source.

## Limits and safety

- The standalone probe establishes UIKit feasibility; development-app checks
  separately exercise Expo Router integration and live system Reduce Motion.
- The probe uses programmatic selection, not touch interaction. Rapid touch
  switching and fallback behavior are checked separately below.
- UIKit still owns the internal views. Future versions can return no match or
  multiple matches; either outcome skips the cosmetic effect safely.
- No KVC, private selector, class-name targeting, delegate replacement, or
  swizzling is used. Runtime class names in evidence are diagnostics only.
- Lookup work is bounded to 128 views and 64 view controllers. Pending calls
  have at most three 50 ms attempts, and a newer request supersedes old ones.
- The scaffold is local and Apple-only with ExpoModulesCore already supplied
  by SDK 57. No runtime package was added. The official scaffold's MIT license
  notice is retained; this introduces no renderer or storage licensing change.

## Reproduction

Use a disposable simulator app under `/tmp`; do not create or edit Muse's
generated root `ios/` or `android/` projects. The bundle needs an Info.plist
with executable `TabBounceSpike`, bundle identifier
`com.muse.tab-bounce-spike`, package type `APPL`, an empty `UILaunchScreen`,
and a `UIApplicationSceneManifest` with multiple scenes disabled. The source
configures its scene delegate through the public app-delegate callback.

```sh
mkdir -p /tmp/muse-tab-bounce-spike.app
cp scripts/spikes/native-tab-bounce-info.plist /tmp/muse-tab-bounce-spike.app/Info.plist
xcrun swiftc -parse-as-library \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target arm64-apple-ios26.0-simulator \
  -module-cache-path /tmp/muse-spike-swift-cache \
  modules/native-tab-bounce/ios/NativeTabIconAnimator.swift \
  scripts/spikes/native-tab-bounce-checks.swift \
  scripts/spikes/native-tab-bounce.swift \
  -o /tmp/muse-tab-bounce-spike.app/TabBounceSpike
codesign --force --sign - /tmp/muse-tab-bounce-spike.app
xcrun simctl install <device-id> /tmp/muse-tab-bounce-spike.app
xcrun simctl launch <device-id> com.muse.tab-bounce-spike
```

After 19 seconds, read `Documents/evidence.json` from the app's simulator data
container (`xcrun simctl get_app_container <device-id>
com.muse.tab-bounce-spike data`). The JSON includes each sample's OS version,
Reduce Motion value, descendant paths, frame, visibility heuristic, symbol
status, selected-image equality, and native check results. Retain the raw evidence if repeating the spike
on another OS. The six-sample evidence from this run is preserved alongside
this note in `docs/spikes/issue-13-ios-26.5.json`.

## References

- [Issue #13](https://github.com/minkgkyaw9899/muse/issues/13)
- [Apple UITabBarItem documentation](https://developer.apple.com/documentation/uikit/uitabbaritem)
- [Apple symbol animation overview](https://developer.apple.com/videos/play/wwdc2023/10258/)
- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)

## Final application acceptance

The final development build was tested through touch interaction on iOS 26.5.
Five consecutive selections (Favorites, Settings, Library, Favorites, Settings)
completed in approximately three seconds; a further Library selection completed
correctly. The recorded frames show icon motion while the native bar remains
intact and settles after switching. Navigation remained responsive.

The same simulator binary was installed on iOS 18.6. The custom fallback bar
rendered correctly; Library, Favorites, and Settings each showed the expected
content and selected accessibility state. Rapid switching across all three
returned to Library without a crash or navigation error. These checks complete
the application acceptance that was separate from the UIKit feasibility probe.
