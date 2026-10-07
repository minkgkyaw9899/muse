import Symbols
import UIKit

/// Public native seam: a selection request can animate only the currently selected icon.
final class NativeTabIconAnimator {
  private weak var animatedIcon: UIImageView?

  func bounce(
    in controller: UITabBarController,
    expectedIndex: Int,
    reduceMotion: () -> Bool = { UIAccessibility.isReduceMotionEnabled }
  ) -> String {
    guard #available(iOS 26.0, *) else { return "unavailable" }
    guard controller.selectedIndex == expectedIndex else { return "stale" }
    // Stop the previous tab's cosmetic effect during rapid switching or a motion change.
    animatedIcon?.removeSymbolEffect(ofType: .bounce, animated: false)
    animatedIcon = nil
    guard !reduceMotion() else { return "reduceMotion" }
    guard let selectedImage = controller.selectedViewController?.tabBarItem.selectedImage,
      selectedImage.isSymbolImage
    else { return "unavailable" }

    var candidates: [UIImageView] = []
    var pending: [(UIView, Bool)] = [(controller.tabBar, true)]
    var visited = 0
    while let (view, parentVisible) = pending.popLast() {
      visited += 1
      // Bound the lookup and skip if a future UIKit hierarchy is unexpectedly large.
      guard visited <= 128 else { return "ambiguous" }
      let visible = parentVisible && !view.isHidden && view.alpha > 0.01
      if visible, view.window != nil, let imageView = view as? UIImageView,
        imageView.image?.isEqual(selectedImage) == true
      {
        candidates.append(imageView)
      }
      let children = view.subviews
      guard visited + pending.count + children.count <= 128 else { return "ambiguous" }
      pending.append(contentsOf: children.map { ($0, visible) })
    }
    guard candidates.count == 1, let icon = candidates.first else {
      return candidates.isEmpty ? "unavailable" : "ambiguous"
    }
    // Read the live setting again immediately before starting the effect.
    guard !reduceMotion() else { return "reduceMotion" }
    icon.removeSymbolEffect(ofType: .bounce, animated: false)
    icon.addSymbolEffect(.bounce, options: .nonRepeating)
    animatedIcon = icon
    return "animated"
  }
}
