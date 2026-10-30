import Foundation
// AVFoundation/Expo doubles only. The complete production AudioStream is appended verbatim.
let NSEC_PER_SEC: UInt64 = 1_000_000_000
let kAudioFormatFlagIsBigEndian: UInt32 = 2
typealias AVAudioChannelCount = UInt32
typealias AVAudioFrameCount = UInt32
enum AudioStreamEncoding: String { case int16, float32 }
struct AudioStreamOptions { var sampleRate: Double = 48000; var channels = 1; var encoding: AudioStreamEncoding = .float32 }
class GenericException<T>: Error { let param: T; init(_ param: T) { self.param = param }; var code: String { "" }; var reason: String { "" } }
class SharedObject {
  var events: [(String, [String: Any])] = []
  func emit(event: String, payload: [String: Any]) { events.append((event, payload)) }
  func sharedObjectWillRelease() {}
}
class ArrayBuffer {
  let bytes: [UInt8]
  init(_ bytes: [UInt8]) { self.bytes = bytes }
  static func copy<T>(of pointer: UnsafePointer<T>, count: Int) -> ArrayBuffer {
    ArrayBuffer(Array(UnsafeRawBufferPointer(start: pointer, count: count)))
  }
}
enum AudioStreamFileFormat { case wav }
struct AudioStreamFileException: Error { let message: String; init(_ message: String) { self.message = message } }
struct AudioStreamFileRecordingResult {
  let uri: String
  let duration: Double
  let size: Int
  let sampleRate: Int
  let channels: Int
  let encoding: AudioStreamEncoding
}
// File encoding/storage is an external boundary; capture/stop still run the SDK class.
class AudioStreamFileWriter {
  static var latest: AudioStreamFileWriter?
  var finishCount = 0
  var appendThrows = false
  var finishThrows = false
  let url: URL
  let channels: Int
  let encoding: AudioStreamEncoding
  var bytes = Data()
  init(url: URL, format: AudioStreamFileFormat, sampleRate: Double, channels: Int, encoding: AudioStreamEncoding) throws {
    self.url = url; self.channels = channels; self.encoding = encoding
    Self.latest = self
  }
  func append(pcmData: Data) throws {
    if appendThrows { throw AudioStreamFileException("controlled append") }
    bytes.append(pcmData)
  }
  func finish() throws -> (Int64, Int64) {
    finishCount += 1
    if finishThrows { throw AudioStreamFileException("controlled finish") }
    return (Int64(bytes.count), Int64(bytes.count / (channels * (encoding == .int16 ? 2 : 4))))
  }
}
enum BoundaryQueue {
  static var work: [() -> Void] = []
  static func async(_ action: @escaping () -> Void) { work.append(action) }
  static func drain() { let pending = work; work = []; pending.forEach { $0() } }
}
let AVAudioSessionInterruptionTypeKey = "type"
extension Notification.Name { static let AVAudioEngineConfigurationChange = Notification.Name("configuration") }
class AVAudioSession: NSObject {
  enum Category { case record }
  enum Mode { case measurement }
  enum Options { case notifyOthersOnDeactivation }
  enum InterruptionType: UInt { case began = 1, ended = 0 }
  static let interruptionNotification = Notification.Name("interruption")
  static let mediaServicesWereLostNotification = Notification.Name("lost")
  static let instance = AVAudioSession()
  static func sharedInstance() -> AVAudioSession { instance }
  var active = false
  var activationThrows = false
  var activationHook: (() -> Void)?
  var deactivationThrows = false
  var deactivations = 0
  func setCategory(_ category: Category, mode: Mode) throws {}
  func setPreferredSampleRate(_ sampleRate: Double) throws {}
  func setActive(_ value: Bool, options: Options? = nil) throws {
    if value { active = true; activationHook?(); if activationThrows { throw NSError(domain: "test", code: 1) } }
    else { deactivations += 1; if deactivationThrows { throw NSError(domain: "test", code: 2) }; active = false }
  }
}
enum AVAudioCommonFormat { case pcmFormatInt16, pcmFormatFloat32, other }
struct AudioStreamBasicDescription { var mFormatFlags: UInt32 = 0 }
class AVAudioFormat {
  let sampleRate: Double
  let channelCount: UInt32
  let commonFormat: AVAudioCommonFormat
  let isInterleaved: Bool
  let streamDescription: UnsafeMutablePointer<AudioStreamBasicDescription>
  init?(commonFormat: AVAudioCommonFormat, sampleRate: Double, channels: UInt32, interleaved: Bool) {
    self.commonFormat = commonFormat; self.sampleRate = sampleRate; channelCount = channels; isInterleaved = interleaved
    streamDescription = .allocate(capacity: 1); streamDescription.initialize(to: AudioStreamBasicDescription())
  }
  deinit { streamDescription.deallocate() }
}
class AVAudioTime { let hostTime: UInt64; init(_ value: UInt64 = 0) { hostTime = value } }
class AVAudioPCMBuffer {
  static var allocationFails = false
  let format: AVAudioFormat
  var frameLength: UInt32 = 0
  let frameCapacity: UInt32
  let int16ChannelData: UnsafeMutablePointer<UnsafeMutablePointer<Int16>>?
  let floatChannelData: UnsafeMutablePointer<UnsafeMutablePointer<Float32>>?
  init?(pcmFormat: AVAudioFormat, frameCapacity: UInt32) {
    if Self.allocationFails { return nil }
    format = pcmFormat; self.frameCapacity = frameCapacity
    let count = max(1, Int(frameCapacity * pcmFormat.channelCount))
    if pcmFormat.commonFormat == .pcmFormatInt16 {
      let samples = UnsafeMutablePointer<Int16>.allocate(capacity: count); samples.initialize(repeating: 0, count: count)
      let pointers = UnsafeMutablePointer<UnsafeMutablePointer<Int16>>.allocate(capacity: 1); pointers.initialize(to: samples)
      int16ChannelData = pointers; floatChannelData = nil
    } else {
      let samples = UnsafeMutablePointer<Float32>.allocate(capacity: count); samples.initialize(repeating: 0, count: count)
      let pointers = UnsafeMutablePointer<UnsafeMutablePointer<Float32>>.allocate(capacity: 1); pointers.initialize(to: samples)
      floatChannelData = pointers; int16ChannelData = nil
    }
  }
  deinit { int16ChannelData?.pointee.deallocate(); int16ChannelData?.deallocate(); floatChannelData?.pointee.deallocate(); floatChannelData?.deallocate() }
}
enum AVAudioConverterInputStatus { case noDataNow, haveData }
enum AVAudioConverterOutputStatus { case haveData, inputRanDry, endOfStream, error }
class AVAudioConverter {
  static var unavailable = false
  static var conversionFails = false
  static var instances = 0
  init?(from: AVAudioFormat, to: AVAudioFormat) { if Self.unavailable { return nil }; Self.instances += 1 }
  func convert(to output: AVAudioPCMBuffer, error: UnsafeMutablePointer<NSError?>?, withInputFrom input: (UInt32, UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioPCMBuffer?) -> AVAudioConverterOutputStatus {
    if Self.conversionFails { error?.pointee = NSError(domain: "test", code: 3); return .error }
    var status = AVAudioConverterInputStatus.noDataNow
    _ = input(2, &status)
    output.frameLength = 2
    output.int16ChannelData?.pointee[0] = 0x0102
    output.int16ChannelData?.pointee[1] = 0x0304
    return .haveData
  }
}
class AVAudioInputNode {
  var tap: ((AVAudioPCMBuffer, AVAudioTime) -> Void)?
  var removals = 0
  func outputFormat(forBus: Int) -> AVAudioFormat { AVAudioEngine.hardware }
  func installTap(onBus: Int, bufferSize: UInt32, format: AVAudioFormat, block: @escaping (AVAudioPCMBuffer, AVAudioTime) -> Void) { tap = block }
  func removeTap(onBus: Int) { removals += 1; tap = nil }
}
class AVAudioEngine: NSObject {
  static var latest: AVAudioEngine?
  static var hardware = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  static var startThrows = false
  static var startHook: (() -> Void)?
  let inputNode = AVAudioInputNode()
  var stops = 0
  override init() { super.init(); Self.latest = self }
  func start() throws { Self.startHook?(); if Self.startThrows { throw NSError(domain: "test", code: 4) } }
  func stop() { stops += 1 }
}
// SDK_AUDIO_STREAM

func reset() -> AudioStream {
  BoundaryQueue.drain()
  AVAudioSession.instance.activationHook = nil
  AVAudioSession.instance.activationThrows = false; AVAudioSession.instance.deactivationThrows = false
  AVAudioSession.instance.active = false; AVAudioSession.instance.deactivations = 0
  AVAudioEngine.startThrows = false; AVAudioEngine.startHook = nil
  AVAudioEngine.hardware = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  AVAudioConverter.unavailable = false; AVAudioConverter.conversionFails = false; AVAudioConverter.instances = 0
  AVAudioPCMBuffer.allocationFails = false
  return AudioStream(options: AudioStreamOptions(sampleRate: 16000, channels: 1, encoding: .int16))
}
func expectCode(_ code: String, _ action: () throws -> Void) {
  do { try action(); fatalError("Expected \(code)") }
  catch { precondition((error as? AudioStreamException)?.code == code, "Wrong error \(error)") }
}
func buffer(_ format: AVAudioFormat) -> AVAudioPCMBuffer { let value = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2)!; value.frameLength = 2; return value }
func errors(_ stream: AudioStream) -> [[String: Any]] { stream.events.filter { $0.1["error"] != nil }.map { $0.1 } }
func runTests() throws {
  let defaults = AudioStreamOptions()
  precondition(defaults.sampleRate == 48000 && defaults.channels == 1 && defaults.encoding == .float32)
  var stream = reset(); try stream.start()
  let input = buffer(AVAudioEngine.hardware)
  input.int16ChannelData!.pointee[0] = 0x0102; input.int16ChannelData!.pointee[1] = -2
  AVAudioEngine.latest!.inputNode.tap!(input, AVAudioTime())
  let pcm = stream.events.first { $0.0 == "audioStreamBuffer" }!.1
  precondition((pcm["data"] as! ArrayBuffer).bytes == [2, 1, 254, 255])
  precondition(pcm["encoding"] as? String == "int16" && pcm["channels"] as? Int == 1)
  let oldTap = AVAudioEngine.latest!.inputNode.tap!
  try stream.stop(); let count = stream.events.count
  oldTap(input, AVAudioTime()); precondition(stream.events.count == count)
  precondition(!AVAudioSession.instance.active)

  _ = reset()
  AVAudioEngine.hardware = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: true)!
  stream = AudioStream(options: AudioStreamOptions(sampleRate: 48000, channels: 2, encoding: .float32))
  try stream.start()
  let stereo = buffer(AVAudioEngine.hardware)
  for (index, sample) in [Float32(1), -1, 0.5, -0.5].enumerated() { stereo.floatChannelData!.pointee[index] = sample }
  AVAudioEngine.latest!.inputNode.tap!(stereo, AVAudioTime())
  let stereoPcm = stream.events.first { $0.0 == "audioStreamBuffer" }!.1
  precondition(stereoPcm["encoding"] as? String == "float32" && stereoPcm["channels"] as? Int == 2)
  precondition((stereoPcm["data"] as! ArrayBuffer).bytes.count == 16)
  precondition(AVAudioConverter.instances == 0)
  stream.sharedObjectWillRelease(); precondition(!AVAudioSession.instance.active)

  stream = reset(); AVAudioEngine.hardware = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: false)!
  try stream.start()
  AVAudioEngine.latest!.inputNode.tap!(buffer(AVAudioEngine.hardware), AVAudioTime())
  let converted = stream.events.first { $0.0 == "audioStreamBuffer" }!.1
  precondition(converted["sampleRate"] as? Double == 16000 && converted["encoding"] as? String == "int16")
  precondition((converted["data"] as! ArrayBuffer).bytes == [2, 1, 4, 3])
  try stream.stop()

  // File recording uses converted PCM, drains pending appends, and leaves live capture running.
  stream = reset(); AVAudioEngine.hardware = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: false)!
  try stream.start()
  let fileUrl = URL(fileURLWithPath: "/tmp/audio-boundary.wav")
  _ = try stream.startFileRecording(url: fileUrl, format: .wav)
  let fileWriter = AudioStreamFileWriter.latest!
  AVAudioEngine.latest!.inputNode.tap!(buffer(AVAudioEngine.hardware), AVAudioTime())
  let fileResult = try stream.stopFileRecording()
  precondition(Array(fileWriter.bytes) == [2, 1, 4, 3] && fileWriter.finishCount == 1)
  precondition(fileResult.size == 4 && fileResult.duration == 2.0 / 16000 && fileResult.sampleRate == 16000)
  precondition(fileResult.channels == 1 && fileResult.encoding == .int16 && stream.isStreaming)
  AVAudioEngine.latest!.inputNode.tap!(buffer(AVAudioEngine.hardware), AVAudioTime())
  try stream.stop()
  precondition(fileWriter.bytes.count == 4 && fileWriter.finishCount == 1)

  for failure in ["none", "append", "finish"] {
    stream = reset(); try stream.start()
    _ = try stream.startFileRecording(url: fileUrl, format: .wav)
    let writer = AudioStreamFileWriter.latest!
    writer.appendThrows = failure == "append"; writer.finishThrows = failure == "finish"
    AVAudioEngine.latest!.inputNode.tap!(buffer(AVAudioEngine.hardware), AVAudioTime())
    if failure == "none" {
      try stream.stop(); precondition(writer.bytes.count == 4)
      try stream.stop()
    } else {
      expectCode("ERR_AUDIO_STREAM_CLEANUP") { try stream.stop() }
      expectCode("ERR_AUDIO_STREAM_CLEANUP") { try stream.stop() }
    }
    precondition(writer.finishCount == 1 && !AVAudioSession.instance.active)
  }

  stream = reset(); AVAudioEngine.hardware = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: false)!
  AVAudioConverter.unavailable = true
  expectCode("ERR_AUDIO_STREAM_FORMAT") { try stream.start() }
  precondition(!AVAudioSession.instance.active && AVAudioEngine.latest!.stops == 1)
  try stream.stop()

  for reason in ["conversion", "allocation"] {
    stream = reset(); AVAudioEngine.hardware = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 2, interleaved: false)!
    try stream.start(); precondition(AVAudioConverter.instances == 1)
    let input = buffer(AVAudioEngine.hardware)
    if reason == "conversion" { AVAudioConverter.conversionFails = true } else { AVAudioPCMBuffer.allocationFails = true }
    AVAudioEngine.latest!.inputNode.tap!(input, AVAudioTime())
    precondition(errors(stream).count == 1 && errors(stream)[0]["error"] as? String == "format")
    BoundaryQueue.drain(); precondition(!AVAudioSession.instance.active)
    try stream.stop(); expectCode("ERR_AUDIO_STREAM_UNAVAILABLE") { try stream.start() }
  }
  // Notifications during native start must become a terminal start result,
  // including when acceptingBuffers has never been enabled.
  for name in [AVAudioSession.interruptionNotification, AVAudioSession.mediaServicesWereLostNotification, Notification.Name.AVAudioEngineConfigurationChange] {
    stream = reset()
    AVAudioEngine.startHook = {
      let object: AnyObject = name == .AVAudioEngineConfigurationChange ? AVAudioEngine.latest! : AVAudioSession.instance
      let info: [AnyHashable: Any]? = name == AVAudioSession.interruptionNotification ? [AVAudioSessionInterruptionTypeKey: UInt(1)] : nil
      NotificationCenter.default.post(name: name, object: object, userInfo: info)
      NotificationCenter.default.post(name: name, object: object, userInfo: info)
    }
    expectCode("ERR_AUDIO_STREAM_INTERRUPTED") { try stream.start() }
    precondition(errors(stream).count == 1 && !stream.isStreaming)
    precondition(!stream.events.contains { $0.1["isStreaming"] as? Bool == true })
    precondition(!AVAudioSession.instance.active && AVAudioEngine.latest!.inputNode.removals == 1)
    let deactivations = AVAudioSession.instance.deactivations
    BoundaryQueue.drain(); try stream.stop()
    precondition(errors(stream).count == 1 && AVAudioSession.instance.deactivations == deactivations)
  }
  stream = reset()
  AVAudioSession.instance.activationHook = {
    NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: AVAudioSession.instance,
      userInfo: [AVAudioSessionInterruptionTypeKey: UInt(1)])
  }
  expectCode("ERR_AUDIO_STREAM_INTERRUPTED") { try stream.start() }
  precondition(errors(stream).count == 1 && !stream.isStreaming && !AVAudioSession.instance.active)
  BoundaryQueue.drain()
  stream = reset(); AVAudioEngine.startThrows = true
  expectCode("ERR_AUDIO_STREAM_UNAVAILABLE") { try stream.start() }
  precondition(AVAudioEngine.latest!.inputNode.removals == 1 && !AVAudioSession.instance.active)
  stream = reset(); AVAudioSession.instance.activationThrows = true
  expectCode("ERR_AUDIO_STREAM_UNAVAILABLE") { try stream.start() }
  precondition(!AVAudioSession.instance.active)

  stream = reset(); try stream.start(); AVAudioSession.instance.deactivationThrows = true
  expectCode("ERR_AUDIO_STREAM_CLEANUP") { try stream.stop() }
  expectCode("ERR_AUDIO_STREAM_CLEANUP") { try stream.stop() }
  stream.sharedObjectWillRelease(); precondition(AVAudioSession.instance.deactivations == 1)
  // A delayed destructor or release must never deactivate a later object's session.
  AVAudioSession.instance.deactivationThrows = false
  let later = AudioStream(options: AudioStreamOptions(sampleRate: 16000, channels: 1, encoding: .int16)); try later.start()
  stream.sharedObjectWillRelease(); precondition(AVAudioSession.instance.active)
  try later.stop()

  stream = reset(); try stream.start()
  NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: AVAudioSession.instance, userInfo: [AVAudioSessionInterruptionTypeKey: UInt(1)])
  precondition(errors(stream).count == 1 && errors(stream)[0]["error"] as? String == "interrupted")
  BoundaryQueue.drain(); precondition(!AVAudioSession.instance.active)
  NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: AVAudioSession.instance, userInfo: [AVAudioSessionInterruptionTypeKey: UInt(0)])
  precondition(!stream.isStreaming && errors(stream).count == 1)
  for name in [AVAudioSession.mediaServicesWereLostNotification, Notification.Name.AVAudioEngineConfigurationChange] {
    stream = reset(); try stream.start()
    let object: AnyObject = name == AVAudioSession.mediaServicesWereLostNotification ? AVAudioSession.instance : AVAudioEngine.latest!
    NotificationCenter.default.post(name: name, object: object)
    precondition(errors(stream).count == 1)
    BoundaryQueue.drain(); precondition(!AVAudioSession.instance.active)
  }
  stream = reset()
  let starting = stream
  let entered = DispatchSemaphore(value: 0); let allowStart = DispatchSemaphore(value: 0)
  let startDone = DispatchSemaphore(value: 0); let stopDone = DispatchSemaphore(value: 0)
  AVAudioEngine.startHook = { entered.signal(); precondition(allowStart.wait(timeout: .now() + 2) == .success) }
  DispatchQueue.global().async { try! starting.start(); startDone.signal() }
  precondition(entered.wait(timeout: .now() + 2) == .success)
  DispatchQueue.global().async { try! starting.stop(); stopDone.signal() }
  precondition(stopDone.wait(timeout: .now() + 0.01) == .timedOut)
  allowStart.signal()
  precondition(startDone.wait(timeout: .now() + 2) == .success)
  precondition(stopDone.wait(timeout: .now() + 2) == .success)
  precondition(!starting.isStreaming && !AVAudioSession.instance.active)
  print("Swift audio boundary passed: actual class, controlled AVFoundation/Expo boundaries")
}
try runTests()
