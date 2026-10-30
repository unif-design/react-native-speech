// System/Expo boundary doubles. Production class, options and method bodies are extracted.
import java.lang.management.ManagementFactory
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*

object Manifest { object permission { const val RECORD_AUDIO = "audio" } }
annotation class RequiresPermission(val value: String)
object Build { object VERSION { var SDK_INT = 29 } }
object MediaRecorder { object AudioSource { const val MIC = 1 } }
object AudioFormat {
  const val CHANNEL_IN_STEREO = 12
  const val CHANNEL_IN_MONO = 16
  const val ENCODING_PCM_16BIT = 2
  const val ENCODING_PCM_FLOAT = 4
}
data class ProcessorAudioFormat(val sampleRate: Int, val channelCount: Int, val encoding: Int)
class ProcessorStreamMetadata private constructor() {
  companion object { val DEFAULT = ProcessorStreamMetadata() }
}
class SonicAudioProcessor {
  companion object {
    var instance: SonicAudioProcessor? = null
  }
  private var outputSampleRate = -1
  private lateinit var inputFormat: ProcessorAudioFormat
  private var output = ByteBuffer.allocateDirect(0)
  private var flushed = false
  var queueCount = 0
    private set
  var resetCount = 0
    private set

  init { instance = this }

  fun setOutputSampleRateHz(sampleRate: Int) { outputSampleRate = sampleRate }
  fun configure(format: ProcessorAudioFormat): ProcessorAudioFormat {
    inputFormat = format
    return format.copy(sampleRate = outputSampleRate)
  }
  fun flush(metadata: ProcessorStreamMetadata) {
    check(metadata === ProcessorStreamMetadata.DEFAULT)
    flushed = true
  }
  fun queueInput(input: ByteBuffer) {
    check(flushed)
    queueCount++
    input.position(input.limit())
    if (queueCount == 1) {
      // A streaming processor may retain the first input while building state.
      output = ByteBuffer.allocateDirect(0)
      return
    }
    val bytesPerSample = if (inputFormat.encoding == AudioFormat.ENCODING_PCM_16BIT) 2 else 4
    output = ByteBuffer.allocateDirect(inputFormat.channelCount * bytesPerSample)
    repeat(output.capacity()) { output.put((0x51 + it).toByte()) }
    output.flip()
  }
  fun getOutput(): ByteBuffer = output.also { output = ByteBuffer.allocateDirect(0) }
  fun reset() { resetCount++ }
}
open class AudioManager {
  open class AudioRecordingCallback {
    open fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {}
  }
}
class AudioRecordingConfiguration(val clientAudioSessionId: Int, val isClientSilenced: Boolean)
open class CodedException(val code: String?, message: String?, cause: Throwable?) : Exception(message, cause)
class NativeArrayBuffer(val buffer: ByteBuffer)
enum class AudioStreamFileFormat { WAV }
class AudioStreamFileException(message: String) : Exception(message)
class AudioStreamFileRecordingResult {
  lateinit var uri: java.net.URL
  var duration = 0.0
  var size = 0L
  var sampleRate = 0
  var channels = 0
  var encoding = AudioStreamEncoding.INT16
}
// Storage/encoding is a boundary; the SDK owns validated PCM and writer lifecycle.
class AudioStreamFileWriter(val file: File, format: AudioStreamFileFormat, sampleRate: Int,
  val channels: Int, val encoding: AudioStreamEncoding) {
  companion object { var latest: AudioStreamFileWriter? = null }
  var finishCount = 0
  var finishThrows = false
  init { latest = this }
  val bytes = mutableListOf<Byte>()
  fun append(pcm: ByteArray) { bytes.addAll(pcm.toList()) }
  fun finish(): Pair<Long, Long> {
    finishCount++
    if (finishThrows) throw AudioStreamFileException("controlled finish")
    return bytes.size.toLong() to
      (bytes.size / (channels * if (encoding == AudioStreamEncoding.INT16) 2 else 4)).toLong()
  }
}
class AppContext(val mainQueue: CoroutineScope)
open class SharedObject(val appContext: AppContext?) {
  val events = mutableListOf<Pair<String, Map<String, Any>>>()
  @Suppress("UNCHECKED_CAST")
  fun emit(event: String, payload: Any?) { events.add(event to (payload as Map<String, Any>)) }
  open fun sharedObjectDidRelease() {}
}
var scheduler = TestCoroutineScheduler()
var captureDispatcher: CoroutineDispatcher = StandardTestDispatcher(scheduler)
var virtualClock = true
var processingNanos = 0L
@OptIn(ExperimentalCoroutinesApi::class)
fun audioNanoTime() = if (virtualClock) scheduler.currentTime * 1_000_000 + processingNanos else System.nanoTime()
class AudioRecord(source: Int, val sampleRate: Int, channel: Int, val audioFormat: Int, size: Int) {
  companion object {
    const val STATE_INITIALIZED = 1
    const val RECORDSTATE_RECORDING = 3
    const val READ_NON_BLOCKING = 1
    const val ERROR = -1
    const val ERROR_BAD_VALUE = -2
    var instance: AudioRecord? = null
    var unsupportedRate = -1
    var readResult = 8
    var startThrows = false
    var stopThrows = false
    var releaseThrows = false
    var readThrows = false
    var readHook: (() -> Unit)? = null
    val readTimes = mutableListOf<Long>()
    fun getMinBufferSize(rate: Int, channels: Int, format: Int) = if (rate == unsupportedRate) ERROR_BAD_VALUE else 320
  }
  val channelCount = if (channel == AudioFormat.CHANNEL_IN_STEREO) 2 else 1
  val state = STATE_INITIALIZED
  val audioSessionId = 77
  var recordingState = 0
  @Volatile var released = false
  @Volatile var readInFlight = false
  @Volatile var releasedDuringRead = false
  var stopCount = 0
  var releaseCount = 0
  var callback: AudioManager.AudioRecordingCallback? = null
  init { instance = this }
  fun startRecording() { if (startThrows) error("controlled start"); recordingState = RECORDSTATE_RECORDING }
  fun stop() { stopCount++; if (stopThrows) error("controlled stop"); recordingState = 0 }
  fun release() { releaseCount++; if (releaseThrows) error("controlled release"); if (readInFlight) releasedDuringRead = true; released = true }
  fun registerAudioRecordingCallback(executor: java.util.concurrent.Executor, callback: AudioManager.AudioRecordingCallback) { this.callback = callback }
  fun unregisterAudioRecordingCallback(callback: AudioManager.AudioRecordingCallback) { this.callback = null }
  fun read(buffer: ByteBuffer, size: Int, mode: Int): Int {
    check(!released && mode == READ_NON_BLOCKING)
    readTimes.add(audioNanoTime() / 1_000_000)
    readInFlight = true
    try {
      readHook?.invoke()
      if (released) releasedDuringRead = true
      check(!releasedDuringRead) { "AUDIO_READ_RELEASE_RACE: read returned after native release" }
      if (readThrows) error("controlled read")
      if (readResult > 0) for (i in 0 until minOf(readResult, size)) buffer.put(i, (i + 1).toByte())
      return readResult
    } finally {
      readInFlight = false
    }
  }
}
// SDK_OPTIONS
// SDK_AUDIO_STREAM

fun reset(): AudioStream {
  scheduler = TestCoroutineScheduler()
  captureDispatcher = StandardTestDispatcher(scheduler)
  virtualClock = true
  processingNanos = 0L
  AudioRecord.unsupportedRate = -1
  AudioRecord.readResult = 8
  AudioRecord.startThrows = false
  AudioRecord.stopThrows = false
  AudioRecord.releaseThrows = false
  AudioRecord.readThrows = false
  AudioRecord.readHook = null
  AudioRecord.readTimes.clear()
  SonicAudioProcessor.instance = null
  return AudioStream(AppContext(CoroutineScope(StandardTestDispatcher(scheduler))), AudioStreamOptions().apply {
    sampleRate = 16000; channels = 2; encoding = AudioStreamEncoding.INT16
  })
}
@OptIn(ExperimentalCoroutinesApi::class)
fun advance(milliseconds: Long) { scheduler.advanceTimeBy(milliseconds); scheduler.runCurrent() }
fun errors(stream: AudioStream) = stream.events.filter { it.second.containsKey("error") }
fun assertCode(code: String, action: () -> Unit) {
  val result = runCatching(action).exceptionOrNull()
  check(result is CodedException && result.code == code) { "Expected $code, got $result" }
}
fun main() {
  var stream = reset()
  stream.start(); stream.stop(); scheduler.runCurrent()
  check(stream.events.map { it.second["isStreaming"] } == listOf(true, false))
  check(AudioRecord.readTimes.isEmpty())
  stream = reset()
  AudioRecord.unsupportedRate = 16000
  stream.start(); scheduler.runCurrent(); advance(100)
  check(stream.events.none { it.first == "audioStreamBuffer" })
  advance(100)
  val pcm = stream.events.first { it.first == "audioStreamBuffer" }.second
  check(pcm["sampleRate"] == 16000 && pcm["channels"] == 2 && pcm["encoding"] == "int16")
  val bytes = (pcm["data"] as NativeArrayBuffer).buffer
  check(bytes.capacity() == 4 && bytes.get(0) == 0x51.toByte() && bytes.get(3) == 0x54.toByte())
  check(SonicAudioProcessor.instance!!.queueCount == 2)
  stream.stop()
  check(AudioRecord.instance!!.released && SonicAudioProcessor.instance!!.resetCount == 1)
  // The writer receives resampled short reads; stopping only the file leaves capture active.
  stream = reset(); AudioRecord.unsupportedRate = 16000
  stream.start(); scheduler.runCurrent()
  stream.startFileRecording(File("/tmp/audio-boundary.wav"), AudioStreamFileFormat.WAV)
  val fileWriter = AudioStreamFileWriter.latest!!
  advance(100); advance(100)
  val fileResult = stream.stopFileRecording()
  check(fileWriter.bytes == listOf<Byte>(0x51, 0x52, 0x53, 0x54) && fileWriter.finishCount == 1)
  check(fileResult.size == 4L && fileResult.duration == 1.0 / 16000 && fileResult.sampleRate == 16000)
  check(fileResult.channels == 2 && fileResult.encoding == AudioStreamEncoding.INT16 && stream.isStreaming)
  advance(100); stream.stop()
  check(fileWriter.bytes.size == 4 && fileWriter.finishCount == 1)

  for (finishFails in listOf(false, true)) {
    stream = reset(); stream.start(); scheduler.runCurrent()
    stream.startFileRecording(File("/tmp/audio-boundary.wav"), AudioStreamFileFormat.WAV)
    val writer = AudioStreamFileWriter.latest!!
    writer.finishThrows = finishFails
    advance(100)
    if (finishFails) {
      assertCode("ERR_AUDIO_STREAM_CLEANUP") { stream.stop() }
      assertCode("ERR_AUDIO_STREAM_CLEANUP") { stream.stop() }
    } else {
      stream.stop(); stream.stop()
    }
    check(writer.bytes.size == 8 && writer.finishCount == 1 && AudioRecord.instance!!.released)
  }
  reset()
  AudioRecord.unsupportedRate = 16000
  stream = AudioStream(AppContext(CoroutineScope(StandardTestDispatcher(scheduler))), AudioStreamOptions().apply {
    sampleRate = 16000; channels = 2; encoding = AudioStreamEncoding.FLOAT32
  })
  stream.start(); scheduler.runCurrent(); advance(100); advance(100)
  val convertedFloat = stream.events.first { it.first == "audioStreamBuffer" }.second
  check(convertedFloat["sampleRate"] == 16000 && convertedFloat["channels"] == 2 && convertedFloat["encoding"] == "float32")
  val floatBytes = (convertedFloat["data"] as NativeArrayBuffer).buffer
  check(floatBytes.capacity() == 8 && floatBytes.get(0) == 0x51.toByte() && floatBytes.get(7) == 0x58.toByte())
  stream.sharedObjectDidRelease()
  check(AudioRecord.instance!!.released && SonicAudioProcessor.instance!!.resetCount == 1)
  reset()
  stream = AudioStream(AppContext(CoroutineScope(StandardTestDispatcher(scheduler))), AudioStreamOptions().apply {
    sampleRate = 48000; channels = 2; encoding = AudioStreamEncoding.FLOAT32
  })
  stream.start(); scheduler.runCurrent(); advance(100)
  val floating = stream.events.first { it.first == "audioStreamBuffer" }.second
  check(floating["encoding"] == "float32" && floating["channels"] == 2)
  check((floating["data"] as NativeArrayBuffer).buffer.capacity() == 8)
  stream.sharedObjectDidRelease(); check(AudioRecord.instance!!.released)

  stream = reset(); stream.start(); scheduler.runCurrent()
  AudioRecord.readResult = 0
  advance(100); advance(100); advance(100)
  check(AudioRecord.readTimes == listOf(100L, 200L, 300L))
  check(stream.events.none { it.first == "audioStreamBuffer" })
  AudioRecord.readHook = { processingNanos += 20_000_000L }
  advance(100); advance(80)
  check(AudioRecord.readTimes.takeLast(2) == listOf(400L, 500L))
  AudioRecord.readHook = { processingNanos += 250_000_000L }
  advance(80)
  check(AudioRecord.readTimes.last() == 600L)
  advance(100)
  check(AudioRecord.readTimes.last() == 950L) // no catch-up burst after a late read
  stream.stop()

  for (failure in listOf("negative", "throw", "frame")) {
    stream = reset(); stream.start(); scheduler.runCurrent()
    AudioRecord.readResult = if (failure == "frame") 3 else -6
    AudioRecord.readThrows = failure == "throw"
    advance(100)
    check(errors(stream).size == 1 && !stream.isStreaming && AudioRecord.instance!!.released)
    check(errors(stream)[0].second["error"] == if (failure == "frame") "format" else "unavailable")
    advance(1000); check(errors(stream).size == 1)
    stream.stop(); assertCode("ERR_AUDIO_STREAM_UNAVAILABLE") { stream.start() }
  }
  stream = reset(); stream.start(); AudioRecord.releaseThrows = true
  assertCode("ERR_AUDIO_STREAM_CLEANUP") { stream.stop() }
  assertCode("ERR_AUDIO_STREAM_CLEANUP") { stream.stop() }
  check(AudioRecord.instance!!.releaseCount == 1)
  stream = reset(); AudioRecord.startThrows = true
  assertCode("ERR_AUDIO_STREAM_UNAVAILABLE") { stream.start() }
  check(AudioRecord.instance!!.released)
  stream = reset(); stream.start(); AudioRecord.stopThrows = true
  assertCode("ERR_AUDIO_STREAM_CLEANUP") { stream.stop() }
  check(AudioRecord.instance!!.released)
  assertCode("ERR_AUDIO_STREAM_CLEANUP") { stream.stop() }
  stream.sharedObjectDidRelease(); check(AudioRecord.instance!!.releaseCount == 1)

  stream = reset(); stream.start(); scheduler.runCurrent()
  val oldCallback = AudioRecord.instance!!.callback!!
  oldCallback.onRecordingConfigChanged(mutableListOf(AudioRecordingConfiguration(77, true)))
  scheduler.runCurrent(); check(errors(stream).single().second["error"] == "interrupted")
  oldCallback.onRecordingConfigChanged(mutableListOf(AudioRecordingConfiguration(77, true)))
  scheduler.runCurrent(); check(errors(stream).size == 1)

  // Real IO coroutine and two threads: identify the exact monitor/owner that
  // stop is blocked on before allowing the controlled system read to return.
  stream = reset(); virtualClock = false; captureDispatcher = Dispatchers.IO
  val entered = CountDownLatch(1); val allowRead = CountDownLatch(1)
  val stopAttempted = CountDownLatch(1)
  val readThreadId = AtomicLong()
  val stopThread = AtomicReference<Thread>()
  AudioRecord.readHook = {
    readThreadId.set(Thread.currentThread().id)
    entered.countDown()
    check(allowRead.await(5, TimeUnit.SECONDS)) { "read release gate timed out" }
    // This is checked while the production read method is still in flight.
    check(!AudioRecord.instance!!.released) { "AUDIO_READ_RELEASE_RACE: released inside read hook" }
  }
  stream = AudioStream(AppContext(CoroutineScope(StandardTestDispatcher(scheduler))), AudioStreamOptions())
  stream.start(); check(entered.await(2, TimeUnit.SECONDS))
  val owned = stream
  val recorder = AudioRecord.instance!!
  val pool = Executors.newSingleThreadExecutor()
  val stopped = pool.submit {
    stopThread.set(Thread.currentThread())
    stopAttempted.countDown()
    owned.stop()
  }
  try {
    check(stopAttempted.await(2, TimeUnit.SECONDS)) { "stop worker was not scheduled" }
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
    val threads = ManagementFactory.getThreadMXBean()
    var waitingForOwnedRead = false
    while (!stopped.isDone && System.nanoTime() < deadline) {
      val info = threads.getThreadInfo(stopThread.get().id)
      if (info != null && info.threadState == Thread.State.BLOCKED &&
        info.lockInfo?.identityHashCode == System.identityHashCode(owned) &&
        info.lockOwnerId == readThreadId.get()) {
        waitingForOwnedRead = true
        break
      }
      Thread.yield()
    }
    // The CI counterexample removes only stop's @Synchronized annotation. It
    // must trip this particular assertion, never an arbitrary timeout/exception.
    check(!recorder.releasedDuringRead && !recorder.released) {
      "AUDIO_READ_RELEASE_RACE: release occurred before the controlled read completed"
    }
    check(waitingForOwnedRead && !stopped.isDone) { "stop did not wait on this stream's read monitor" }
    allowRead.countDown()
    stopped.get(2, TimeUnit.SECONDS)
    check(recorder.released && !recorder.releasedDuringRead)
    scheduler.runCurrent()
    check(stream.events.none { it.first == "audioStreamBuffer" })
  } finally {
    allowRead.countDown()
    pool.shutdownNow()
  }
  println("Kotlin audio boundary passed: actual class, real coroutines, controlled Android/Expo boundaries")
}
