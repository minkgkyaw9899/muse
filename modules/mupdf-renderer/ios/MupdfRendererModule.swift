import ExpoModulesCore
import Foundation

/// Exposes `inspectAsync` and `cancel` per the module contract in `native-document-renderer.ts`.
/// Cancellation, the concurrency bound, and cleanup live in `MuseInspect.c`, where the host tests cover them.
public class MupdfRendererModule: Module {
  private static let largestSafeInteger = 9_007_199_254_740_991.0

  /// Only files inside this app's own container may be inspected. Symlinks are resolved first, so a
  /// link that points elsewhere is rejected. Picker URLs must be copied into the app first (ADR 0002).
  private static func appOwnedPath(_ uri: String) -> String? {
    guard let url = URL(string: uri), url.isFileURL else { return nil }
    let path = url.resolvingSymlinksInPath().standardizedFileURL.path
    let home = URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path
    return path.hasPrefix(home + "/") ? path : nil
  }

  private static func failure(_ code: String) -> [String: Any] {
    return ["status": "error", "code": code]
  }

  public func definition() -> ModuleDefinition {
    Name("MupdfRenderer")

    AsyncFunction("inspectAsync") { (uri: String, operationId: String, maxBytes: Double?) -> [String: Any] in
      guard let path = Self.appOwnedPath(uri) else { return Self.failure("file_missing") }

      var limit: Int64 = -1
      if let maxBytes {
        // Int64(Double) traps on NaN, infinity, and out-of-range values.
        guard maxBytes.isFinite, maxBytes >= 0, maxBytes <= Self.largestSafeInteger else {
          return Self.failure("invalid_request")
        }
        limit = Int64(maxBytes)
      }

      var result = MuseInspection()
      muse_inspect(operationId, path, limit, &result)

      if result.ok == 0 {
        let code = withUnsafePointer(to: &result.code) {
          $0.withMemoryRebound(to: CChar.self, capacity: 32) { String(cString: $0) }
        }
        return Self.failure(code)
      }
      let fingerprint = withUnsafePointer(to: &result.fingerprint) {
        $0.withMemoryRebound(to: CChar.self, capacity: 65) { String(cString: $0) }
      }
      return ["status": "ok", "pageCount": Int(result.page_count), "fingerprint": fingerprint]
    }

    Function("cancel") { (operationId: String) in
      muse_cancel(operationId)
    }
  }
}
