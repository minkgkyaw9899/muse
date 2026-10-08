import ExpoModulesCore
import UIKit

public class NativeTabBounceModule: Module {
  private let animator = NativeTabIconAnimator()
  private var generation = 0

  public func definition() -> ModuleDefinition {
    Name("NativeTabBounce")

    AsyncFunction("bounce") { (index: Int, promise: Promise) in
      self.generation += 1
      self.attempt(index: index, generation: self.generation, remaining: 3, promise: promise)
    }.runOnQueue(.main)
  }

  private func attempt(index: Int, generation: Int, remaining: Int, promise: Promise) {
    // Allow UIKit to apply its selected image before looking for it. No polling loop.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
      guard let self else {
        promise.resolve("unavailable")
        return
      }
      guard self.generation == generation else {
        promise.resolve("stale")
        return
      }
      let result: String
      if let controller = self.tabController() {
        result = self.animator.bounce(in: controller, expectedIndex: index)
      } else {
        result = "unavailable"
      }
      if remaining > 1 && (result == "stale" || result == "unavailable") {
        self.attempt(
          index: index, generation: generation, remaining: remaining - 1, promise: promise)
      } else {
        promise.resolve(result)
      }
    }
  }

  private func tabController() -> UITabBarController? {
    // Development overlays can own the key window. Inspect visible windows in
    // active scenes and require a single tab controller instead of picking a window.
    var pending = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap { $0.windows }
      .filter { !$0.isHidden && $0.alpha > 0.01 }
      .compactMap { $0.rootViewController }
    guard pending.count <= 64 else { return nil }
    var candidates: [UITabBarController] = []
    var visited = 0
    while let controller = pending.popLast() {
      visited += 1
      guard visited <= 64 else { return nil }
      if let tabs = controller as? UITabBarController, tabs.viewIfLoaded?.window != nil {
        candidates.append(tabs)
      }
      let children = controller.children
      guard visited + pending.count + children.count <= 64 else { return nil }
      pending.append(contentsOf: children)
    }
    return candidates.count == 1 ? candidates.first : nil
  }
}
