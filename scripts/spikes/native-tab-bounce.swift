import Symbols
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication, configurationForConnecting session: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let config = UISceneConfiguration(name: "Spike", sessionRole: session.role)
    config.delegateClass = SceneDelegate.self
    return config
  }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  let tabs = UITabBarController()
  var evidence: [[String: Any]] = []

  func scene(
    _ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions
  ) {
    guard let scene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: scene)
    let symbols = [
      ("Library", "books.vertical", "books.vertical.fill"), ("Favorites", "heart", "heart.fill"),
      ("Settings", "gearshape", "gearshape.fill"),
    ]
    tabs.viewControllers = symbols.map { title, normal, selected in
      let view = UIViewController()
      view.view.backgroundColor = .systemBackground
      view.tabBarItem = UITabBarItem(
        title: title, image: UIImage(systemName: normal),
        selectedImage: UIImage(systemName: selected))
      return view
    }
    window.rootViewController = tabs
    self.window = window
    window.makeKeyAndVisible()
    for (step, selection) in [0, 1, 2, 0, 2, 1].enumerated() {
      DispatchQueue.main.asyncAfter(deadline: .now() + Double(step * 3 + 2)) { [self] in
        tabs.selectedIndex = selection
        tabs.view.layoutIfNeeded()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [self] in
          inspect("selection-\(selection)-step-\(step)")
        }
      }
    }
  }

  func inspect(_ label: String) {
    var nodes: [[String: Any]] = []
    func walk(_ view: UIView, path: String, visible: Bool) {
      let visible = visible && !view.isHidden && view.alpha > 0.01
      let frame = view.convert(view.bounds, to: tabs.tabBar)
      var record: [String: Any] = [
        "path": path, "type": String(describing: type(of: view)), "visible": visible,
        "frame": NSCoder.string(for: frame),
      ]
      if let image = view as? UIImageView {
        record["isSymbol"] = image.image?.isSymbolImage ?? false
        record["hasImage"] = image.image != nil
        record["matchesSelectedImage"] =
          image.image?.isEqual(tabs.selectedViewController?.tabBarItem.selectedImage) ?? false

      }
      nodes.append(record)
      for (index, child) in view.subviews.enumerated() {
        walk(child, path: "\(path)/\(index)", visible: visible)
      }
    }
    walk(tabs.tabBar, path: "tabBar", visible: true)
    let checks = checkNativeTabBounce(in: tabs)
    evidence.append([
      "checks": checks, "label": label, "os": UIDevice.current.systemVersion,
      "reduceMotion": UIAccessibility.isReduceMotionEnabled, "nodes": nodes,
    ])
    let output = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("evidence.json")
    try! JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
      .write(to: output)
  }
}
