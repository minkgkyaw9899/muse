import UIKit

/// Run against the visible UIKit fixture and the production native selection seam.
func checkNativeTabBounce(in tabs: UITabBarController) -> [String: String] {
  let animator = NativeTabIconAnimator()
  let selected = tabs.selectedIndex
  let stale = animator.bounce(in: tabs, expectedIndex: (selected + 1) % 3)
  precondition(stale == "stale", "An obsolete selection must not animate")
  let reduced = animator.bounce(in: tabs, expectedIndex: selected, reduceMotion: { true })
  precondition(reduced == "reduceMotion", "Reduce Motion must skip the bounce")

  let duplicate = UIImageView(image: tabs.selectedViewController?.tabBarItem.selectedImage)
  tabs.tabBar.addSubview(duplicate)
  let ambiguous = animator.bounce(in: tabs, expectedIndex: selected, reduceMotion: { false })
  duplicate.removeFromSuperview()
  precondition(ambiguous == "ambiguous", "Ambiguous targets must skip the bounce")

  let result = animator.bounce(in: tabs, expectedIndex: selected)
  precondition(
    result == (UIAccessibility.isReduceMotionEnabled ? "reduceMotion" : "animated"),
    "The unique selected icon must animate unless system Reduce Motion is enabled")
  return ["stale": stale, "reducedMotion": reduced, "ambiguous": ambiguous, "selection": result]
}
