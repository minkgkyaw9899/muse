import Foundation

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
  if !condition() { throw TestFailure(message: message) }
}
struct TestFailure: Error { let message: String }

func copied(_ sources: PublicationSources, _ sourceId: String, _ operationId: String)
  throws -> Result<CopiedPublicationSource, PublicationCopyFailure> {
  let semaphore = DispatchSemaphore(value: 0)
  var result: Result<CopiedPublicationSource, PublicationCopyFailure>?
  sources.copy(sourceId, operationId: operationId) { value in
    result = value
    semaphore.signal()
  }
  guard semaphore.wait(timeout: .now() + 10) == .success, let result else {
    throw TestFailure(message: "Copy did not settle")
  }
  return result
}

@main struct PublicationSourcesTests {
  static func main() {
    do { try run() } catch {
      FileHandle.standardError.write(Data("FAIL: \(error)\n".utf8))
      exit(1)
    }
  }
  static func run() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let staging = root.appendingPathComponent("staging")
    let input = root.appendingPathComponent("valid.pdf")
    let bytes = Data("selected publication bytes".utf8)
    try bytes.write(to: input)
    let sources = PublicationSources(stagingDirectory: staging)
    defer { sources.shutdown() }
    let selected = try sources.select([input, root.appendingPathComponent("missing.pdf"), input])
    try require(selected.count == 3, "Selection must retain every source without opening it")
    // A trailing line break must not pass the operation id check (ICU's `$` would accept it).
    if case .success = try copied(sources, selected[0].id, "trailing-newline\n") {
      throw TestFailure(message: "An operation id ending in a newline must be rejected")
    }
    print("PASS operation ids reject a trailing newline")
    try require(Set(selected.map(\.id)).count == 3, "Repeated selections need independent ownership")
    try require(!FileManager.default.fileExists(atPath: staging.path), "Selection must not copy bytes")
    let result = try copied(sources, selected[0].id, "first")
    let file = try result.get()
    try require(file.byteSize == 26, "Report the actual copied byte count")
    let output = try Data(contentsOf: URL(string: file.uri)!)
    try require(output == bytes, "Copy the selected bytes intact")
    sources.release(selected[0].id)
    print("PASS selection defers provider reads/copies until an active import")
    sources.cancel(selected[2].id)
    switch try copied(sources, selected[2].id, "cancelled-before-copy") {
    case .failure(let failure): try require(failure == .cancelled, "Cancellation before scheduling must be retained")
    case .success: throw TestFailure(message: "Cancelled selection was copied")
    }
    try require(!FileManager.default.fileExists(atPath: staging.appendingPathComponent("cancelled-before-copy.pdf").path), "Queued cancellation must not create a staging file")
    print("PASS queued cancellation never copies bytes")
    switch try copied(sources, selected[0].id, "released-source") {
    case .failure(let failure): try require(failure == .permissionDenied, "Released source must no longer be readable")
    case .success: throw TestFailure(message: "Released source remained readable")
    }
    let oversized = root.appendingPathComponent("oversized.pdf")
    FileManager.default.createFile(atPath: oversized.path, contents: nil)
    let oversizedHandle = try FileHandle(forWritingTo: oversized)
    try oversizedHandle.truncate(atOffset: 2_147_483_649)
    try oversizedHandle.close()
    let oversizedSource = try sources.select([oversized])[0]
    switch try copied(sources, oversizedSource.id, "oversized") {
    case .failure(let failure): try require(failure == .resourceLimit, "Reject files above 2 GiB before copying")
    case .success: throw TestFailure(message: "Oversized source was copied")
    }
    try require(!FileManager.default.fileExists(atPath: staging.appendingPathComponent("oversized.pdf").path), "Oversized admission must leave no staging output")
    sources.release(oversizedSource.id)
    print("PASS release invalidates access and oversized sources do not copy")
    let large = root.appendingPathComponent("large.pdf")
    FileManager.default.createFile(atPath: large.path, contents: nil)
    let largeHandle = try FileHandle(forWritingTo: large)
    try largeHandle.truncate(atOffset: 268_435_456)
    try largeHandle.close()
    let largeSource = try sources.select([large])[0]
    let copyDone = DispatchSemaphore(value: 0)
    var interrupted: Result<CopiedPublicationSource, PublicationCopyFailure>?
    sources.copy(largeSource.id, operationId: "active-cancel") { value in
      interrupted = value; copyDone.signal()
    }
    let partial = staging.appendingPathComponent("active-cancel.pdf")
    let deadline = Date().addingTimeInterval(5)
    var copiedBytes = 0
    while copiedBytes == 0 && Date() < deadline {
      copiedBytes = (try? FileManager.default.attributesOfItem(atPath: partial.path)[.size] as? Int) ?? 0
      Thread.sleep(forTimeInterval: 0.001)
    }
    try require(copiedBytes > 0, "Cancellation test must reach an actual active copy")
    sources.cancel(largeSource.id)
    try require(copyDone.wait(timeout: .now() + 5) == .success, "Active cancellation must settle")
    switch interrupted {
    case .failure(let failure): try require(failure == .cancelled, "Active copy must return cancellation")
    default: throw TestFailure(message: "Active cancellation lost its outcome")
    }
    try require(!FileManager.default.fileExists(atPath: partial.path), "Active cancellation must remove partial bytes before settling")
    sources.release(largeSource.id)
    print("PASS active streaming cancellation cleans partial output before settling")

    let writeStarted = DispatchSemaphore(value: 0)
    let releaseWriter = DispatchSemaphore(value: 0)
    let writerDone = DispatchSemaphore(value: 0)
    DispatchQueue.global(qos: .utility).async {
      var error: NSError?
      NSFileCoordinator().coordinate(writingItemAt: large, options: [], error: &error) { _ in
        writeStarted.signal()
        releaseWriter.wait()
      }
      writerDone.signal()
    }
    defer { releaseWriter.signal() }
    try require(writeStarted.wait(timeout: .now() + 5) == .success, "Provider coordination fixture must be ready")
    let concurrent = try sources.select([large, large, large])
    let firstDone = DispatchSemaphore(value: 0)
    let secondDone = DispatchSemaphore(value: 0)
    var first: Result<CopiedPublicationSource, PublicationCopyFailure>?
    var second: Result<CopiedPublicationSource, PublicationCopyFailure>?
    sources.copy(concurrent[0].id, operationId: "concurrent-one") { first = $0; firstDone.signal() }
    sources.copy(concurrent[1].id, operationId: "concurrent-two") { second = $0; secondDone.signal() }
    switch try copied(sources, concurrent[2].id, "concurrent-three") {
    case .failure(let failure): try require(failure == .resourceLimit, "Native work must independently reject a third active copy")
    case .success: throw TestFailure(message: "Three native copies ran concurrently")
    }
    sources.shutdown()
    releaseWriter.signal()
    try require(writerDone.wait(timeout: .now() + 5) == .success, "Provider coordination must release")
    try require(firstDone.wait(timeout: .now() + 5) == .success, "First copy must settle after cancellation")
    try require(secondDone.wait(timeout: .now() + 5) == .success, "Second copy must settle after cancellation")
    for result in [first, second] {
      switch result {
      case .failure(let failure): try require(failure == .cancelled, "Both active operations must cancel")
      default: throw TestFailure(message: "Concurrent cancellation lost its outcome")
      }
    }
    for operation in ["concurrent-one", "concurrent-two"] {
      try require(!FileManager.default.fileExists(atPath: staging.appendingPathComponent("\(operation).pdf").path), "Shutdown must leave no partial staging files")
    }
    do {
      _ = try sources.select([input])
      throw TestFailure(message: "Shutdown allowed another selection")
    } catch PublicationCopyFailure.cancelled { }
    print("PASS native two-copy bound and shutdown during provider coordination")
  }
}
