import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

private final class PublicationPickingDelegate: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  weak var owner: PublicationImportModule?
  init(_ owner: PublicationImportModule) { self.owner = owner }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    owner?.finishPicking(urls)
  }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { owner?.finishPicking([]) }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { owner?.finishPicking([]) }
}

public class PublicationImportModule: Module {
  private var sources: PublicationSources?
  private var pickingPromise: Promise?
  private var picker: UIDocumentPickerViewController?
  private var pickingDelegate: PublicationPickingDelegate?

  public func definition() -> ModuleDefinition {
    Name("PublicationImport")
    OnCreate {
      let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      self.sources = PublicationSources(stagingDirectory: documents.appendingPathComponent("staging", isDirectory: true))
    }
    AsyncFunction("pick") { (multiple: Bool, promise: Promise) in
      guard self.pickingPromise == nil,
            let viewController = self.appContext?.utilities?.currentViewController() else {
        promise.resolve(["status": "error", "category": "permissionDenied"]); return
      }
      // Open in place: the picker does not import/copy the entire selection first.
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.pdf], asCopy: false)
      let delegate = PublicationPickingDelegate(self)
      self.pickingPromise = promise
      self.picker = picker
      self.pickingDelegate = delegate
      picker.delegate = delegate
      picker.allowsMultipleSelection = multiple
      picker.modalPresentationStyle = .pageSheet
      viewController.present(picker, animated: true)
      picker.presentationController?.delegate = delegate
    }.runOnQueue(.main)
    AsyncFunction("copy") { (sourceId: String, operationId: String, promise: Promise) in
      guard let sources = self.sources else {
        promise.resolve(["status": "error", "category": "storage"]); return
      }
      sources.copy(sourceId, operationId: operationId) { result in
        switch result {
        case .success(let file):
          promise.resolve(["status": "copied", "uri": file.uri,
            "relativePath": file.relativePath, "byteSize": file.byteSize])
        case .failure(let error):
          promise.resolve(["status": "error", "category": error.rawValue])
        }
      }
    }
    Function("cancel") { (sourceId: String) in self.sources?.cancel(sourceId) }
    Function("release") { (sourceId: String) in self.sources?.release(sourceId) }
    OnDestroy {
      self.sources?.shutdown()
      DispatchQueue.main.async {
        let picker = self.picker
        self.finishPicking([])
        picker?.dismiss(animated: false)
      }
    }
  }

  fileprivate func finishPicking(_ urls: [URL]) {
    guard let promise = pickingPromise else { return }
    pickingPromise = nil
    picker = nil
    pickingDelegate = nil
    guard !urls.isEmpty else { promise.resolve(["status": "cancelled"]); return }
    do {
      guard let sources else { throw PublicationCopyFailure.storage }
      let selected = try sources.select(urls)
      promise.resolve(["status": "selected", "sources": selected.map { ["id": $0.id, "name": $0.name] }])
    } catch {
      promise.resolve(["status": "error", "category": "permissionDenied"])
    }
  }
}
