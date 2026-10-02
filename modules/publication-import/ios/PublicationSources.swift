import Foundation
import Darwin

struct SelectedPublicationSource {
  let id: String
  let name: String
}

struct CopiedPublicationSource {
  let uri: String
  let relativePath: String
  let byteSize: Int
}

enum PublicationCopyFailure: String, Error {
  case cancelled, permissionDenied, resourceLimit, storage
}

private final class PublicationSourceAccess {
  let url: URL
  private let lock = NSLock()
  private var cancelled = false
  private var coordinator: NSFileCoordinator?

  init(_ url: URL) { self.url = url }

  func checkCancellation() throws {
    lock.lock()
    let value = cancelled
    lock.unlock()
    if value { throw PublicationCopyFailure.cancelled }
  }

  func coordinate(with coordinator: NSFileCoordinator) throws {
    lock.lock()
    self.coordinator = coordinator
    let value = cancelled
    lock.unlock()
    if value { coordinator.cancel(); throw PublicationCopyFailure.cancelled }
  }

  func finishCoordination() {
    lock.lock()
    coordinator = nil
    lock.unlock()
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let activeCoordinator = coordinator
    lock.unlock()
    activeCoordinator?.cancel()
  }
}

// Provider URLs are temporary inputs. Only an active copy holds access or reads bytes.
final class PublicationSources {
  private let stagingDirectory: URL
  private let lock = NSLock()
  private let workers = DispatchQueue(label: "muse.publication-copy", qos: .utility, attributes: .concurrent)
  private var selected: [String: PublicationSourceAccess] = [:]
  private var closed = false
  private var active: Set<String> = []
  private let maxBytes = 2 * 1024 * 1024 * 1024

  init(stagingDirectory: URL) { self.stagingDirectory = stagingDirectory }

  func select(_ urls: [URL]) throws -> [SelectedPublicationSource] {
    guard urls.allSatisfy(\.isFileURL) else { throw PublicationCopyFailure.permissionDenied }
    lock.lock()
    defer { lock.unlock() }
    guard !closed else { throw PublicationCopyFailure.cancelled }
    return urls.map { url in
      let id = UUID().uuidString
      selected[id] = PublicationSourceAccess(url)
      return SelectedPublicationSource(id: id, name: url.lastPathComponent)
    }
  }

  func copy(_ sourceId: String, operationId: String,
            completion: @escaping (Result<CopiedPublicationSource, PublicationCopyFailure>) -> Void) {
    guard operationId.range(of: "\\A[a-zA-Z0-9_-]+\\z", options: .regularExpression) != nil else {
      completion(.failure(.storage)); return
    }
    lock.lock()
    guard let source = selected[sourceId] else {
      lock.unlock(); completion(.failure(.permissionDenied)); return
    }
    guard active.count < 2, !active.contains(operationId) else {
      lock.unlock(); completion(.failure(.resourceLimit)); return
    }
    active.insert(operationId)
    lock.unlock()
    workers.async {
      let result: Result<CopiedPublicationSource, PublicationCopyFailure>
      do { result = .success(try self.copyBytes(source, operationId: operationId)) }
      catch let error as PublicationCopyFailure { result = .failure(error) }
      catch { result = .failure(.storage) }
      self.lock.lock()
      self.active.remove(operationId)
      self.lock.unlock()
      completion(result)
    }
  }

  private func copyBytes(_ source: PublicationSourceAccess, operationId: String) throws -> CopiedPublicationSource {
    try source.checkCancellation()
    let scoped = source.url.startAccessingSecurityScopedResource()
    defer { if scoped { source.url.stopAccessingSecurityScopedResource() } }
    let coordinator = NSFileCoordinator()
    try source.coordinate(with: coordinator)
    defer { source.finishCoordination() }
    var coordinationError: NSError?
    var result: Result<CopiedPublicationSource, Error>?
    coordinator.coordinate(readingItemAt: source.url, options: .withoutChanges, error: &coordinationError) { url in
      result = Result { try self.stream(url, access: source, operationId: operationId) }
    }
    if let result { return try result.get() }
    try source.checkCancellation()
    throw PublicationCopyFailure.permissionDenied
  }

  private func stream(_ source: URL, access: PublicationSourceAccess, operationId: String) throws -> CopiedPublicationSource {
    try access.checkCancellation()
    let attributes: URLResourceValues
    do { attributes = try source.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey]) }
    catch { throw PublicationCopyFailure.permissionDenied }
    guard attributes.isRegularFile == true else { throw PublicationCopyFailure.permissionDenied }
    if let size = attributes.fileSize, size > maxBytes { throw PublicationCopyFailure.resourceLimit }
    let reader: FileHandle
    do { reader = try FileHandle(forReadingFrom: source) }
    catch { throw PublicationCopyFailure.permissionDenied }
    defer { try? reader.close() }
    try FileManager.default.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
    let destination = stagingDirectory.appendingPathComponent("\(operationId).pdf")
    let fd = Darwin.open(destination.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
    guard fd >= 0 else { throw PublicationCopyFailure.storage }
    let writer = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    defer { try? writer.close() }
    let outcome = Result<Int, Error> {
      var byteSize = 0
      while true {
        // FileHandle can return autoreleased NSData; drain each chunk instead of retaining
        // every provider buffer until the Dispatch work item finishes.
        let count = try autoreleasepool { () throws -> Int in
          try access.checkCancellation()
          let bytes = try reader.read(upToCount: 256 * 1024) ?? Data()
          if bytes.isEmpty { return 0 }
          byteSize += bytes.count
          guard byteSize <= maxBytes else { throw PublicationCopyFailure.resourceLimit }
          try access.checkCancellation()
          try writer.write(contentsOf: bytes)
          return bytes.count
        }
        if count == 0 { break }
      }
      try access.checkCancellation()
      try writer.synchronize()
      try reader.close()
      try writer.close()
      return byteSize
    }
    if case .failure(let error) = outcome {
      try? reader.close()
      try? writer.close()
      do { try FileManager.default.removeItem(at: destination) }
      catch { throw PublicationCopyFailure.storage }
      throw error
    }
    let byteSize = try outcome.get()
    return CopiedPublicationSource(uri: destination.absoluteString,
      relativePath: "staging/\(operationId).pdf", byteSize: byteSize)
  }

  func cancel(_ sourceId: String) {
    lock.lock()
    let source = selected[sourceId]
    lock.unlock()
    source?.cancel()
  }

  func release(_ sourceId: String) {
    lock.lock()
    let source = selected.removeValue(forKey: sourceId)
    lock.unlock()
    source?.cancel()
  }

  func shutdown() {
    lock.lock()
    closed = true
    let sources = Array(selected.values)
    selected.removeAll()
    lock.unlock()
    for source in sources { source.cancel() }
  }
}
