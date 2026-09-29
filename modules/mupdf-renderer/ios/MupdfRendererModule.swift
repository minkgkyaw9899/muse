import ExpoModulesCore
import Foundation

/// Exposes `inspectAsync` and `cancel` per the module contract in `native-document-renderer.ts`.
/// Cancellation, the concurrency bound, and cleanup live in `MuseInspect.c`, where the host tests cover them.
public class MupdfRendererModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MupdfRenderer")

    AsyncFunction("inspectAsync") { (uri: String, operationId: String, maxBytes: Double?) -> [String: Any] in
      guard let url = URL(string: uri), url.isFileURL else {
        return ["status": "error", "code": "file_missing"]
      }
      var result = MuseInspection()
      muse_inspect(operationId, url.path, maxBytes.map { Int64($0) } ?? -1, &result)

      if result.ok == 0 {
        let code = withUnsafePointer(to: &result.code) {
          $0.withMemoryRebound(to: CChar.self, capacity: 32) { String(cString: $0) }
        }
        return ["status": "error", "code": code]
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
