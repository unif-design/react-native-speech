import { AudioModule } from 'expo-audio';
import type { AudioStreamBuffer } from 'expo-audio';
import { openAudioCapture } from '@unif/react-native-speech/capture';
import type { AudioCaptureInput } from '@unif/react-native-speech/capture';
import { AudioStreamFixture, deferredStart } from './audioStreamFixture';

jest.mock('expo-audio', () => ({ AudioModule: { AudioStream: jest.fn() } }));

const construct = jest.mocked(AudioModule.AudioStream);
let stream: AudioStreamFixture;
const input: AudioCaptureInput = {
  sampleRate: 16000,
  channels: 1,
  encoding: 'int16',
};
const handlers = () => ({ onBuffer: jest.fn(), onError: jest.fn() });

beforeEach(() => {
  stream = new AudioStreamFixture();
  construct.mockImplementation(
    () => stream as unknown as InstanceType<typeof AudioModule.AudioStream>,
  );
});

test.each([
  undefined,
  null,
  {},
  { ...input, sampleRate: 0 },
  { ...input, sampleRate: -1 },
  { ...input, sampleRate: Infinity },
  { ...input, sampleRate: NaN },
  { ...input, sampleRate: 16000.5 },
  { ...input, channels: 0 },
  { ...input, channels: 3 },
  { ...input, encoding: 'pcm' },
])('无效配置 %p 不创建原生对象，句柄可重复安全停止', async (invalid) => {
  const callbacks = handlers();
  const capture = openAudioCapture(invalid as AudioCaptureInput, callbacks);
  await expect(capture.started).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'invalid_input' },
  });
  const stopped = capture.stop();
  expect(capture.stop()).toBe(stopped);
  await expect(stopped).resolves.toEqual({ status: 'stopped' });
  expect(construct).not.toHaveBeenCalled();
  expect(callbacks.onError).not.toHaveBeenCalled();
});

test('配置及 handlers 按次快照；实际 fallback 格式原样交付且只交付公共字段', async () => {
  const configuration = { ...input };
  const callbacks = handlers();
  const onBuffer = callbacks.onBuffer;
  const capture = openAudioCapture(configuration, callbacks);
  configuration.sampleRate = 8000;
  callbacks.onBuffer = jest.fn();
  await expect(capture.started).resolves.toEqual({ status: 'started' });
  expect(construct).toHaveBeenCalledWith({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
  });
  const data = new ArrayBuffer(4);
  new DataView(data).setInt16(0, 123, true);
  new DataView(data).setInt16(2, -45, true);
  stream.buffer({ data });
  expect(onBuffer).toHaveBeenCalledWith({
    data,
    sampleRate: 48000,
    channels: 1,
    encoding: 'int16',
  });
  expect(onBuffer.mock.calls[0][0].data).toBe(data);
  expect(callbacks.onBuffer).not.toHaveBeenCalled();
  await expect(capture.stop()).resolves.toEqual({ status: 'stopped' });
  expect(stream.calls).toEqual([
    'audioStreamBuffer',
    'audioStreamStatus',
    'start',
    'stop',
    'removeBuffer',
    'removeStatus',
    'release',
  ]);
});

test('float32 立体声整帧交付实际编码', async () => {
  stream.channels = 2;
  const callbacks = handlers();
  const capture = openAudioCapture(
    { sampleRate: 48000, channels: 2, encoding: 'float32' },
    callbacks,
  );
  await capture.started;
  const data = new ArrayBuffer(8);
  new DataView(data).setFloat32(0, 0.25, true);
  new DataView(data).setFloat32(4, -0.5, true);
  stream.buffer({ data, encoding: 'float32' });
  expect(callbacks.onBuffer).toHaveBeenCalledWith({
    data,
    sampleRate: 48000,
    channels: 2,
    encoding: 'float32',
  });
  await capture.stop();
});

test.each([
  { encoding: undefined },
  { encoding: 'unknown' },
  { data: new Uint8Array(4) },
  { data: new ArrayBuffer(3) },
  { data: new ArrayBuffer(6), encoding: 'float32' },
  { channels: 3 },
  { sampleRate: 0 },
  { sampleRate: NaN },
  { sampleRate: 44100 },
  { channels: 2 },
])('未知、非整帧或与 SDK 实际格式矛盾的事件 %p 结束采集', async (overrides) => {
  const callbacks = handlers();
  const capture = openAudioCapture(input, callbacks);
  await capture.started;
  stream.buffer(overrides as unknown as Partial<AudioStreamBuffer>);
  stream.buffer();
  stream.statuses({ isStreaming: false, error: 'unavailable' });
  expect(callbacks.onBuffer).not.toHaveBeenCalled();
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
  expect(callbacks.onError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'format' }),
  );
  await expect(capture.stop()).resolves.toEqual({ status: 'stopped' });
  expect(stream.stop).toHaveBeenCalledTimes(1);
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test.each(['construct', 'listen', 'start', 'asyncStart'])(
  '%s 失败通过 started 返回安全错误并只释放已有资源',
  async (phase) => {
    const sensitive = new Error('secret credential PCM content');
    if (phase === 'construct')
      construct.mockImplementationOnce(() => {
        throw sensitive;
      });
    if (phase === 'listen')
      stream.addListener.mockImplementationOnce(() => {
        throw sensitive;
      });
    if (phase === 'start')
      stream.start.mockImplementationOnce(() => {
        throw sensitive;
      });
    if (phase === 'asyncStart') stream.start.mockRejectedValueOnce(sensitive);
    const callbacks = handlers();
    const capture = openAudioCapture(input, callbacks);
    const result = await capture.started;
    expect(result).toMatchObject({
      status: 'failed',
      error: { reason: 'unavailable' },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(callbacks.onError).not.toHaveBeenCalled();
    await capture.stop();
    expect(stream.release).toHaveBeenCalledTimes(phase === 'construct' ? 0 : 1);
    expect(stream.stop).toHaveBeenCalledTimes(phase === 'construct' ? 0 : 1);
  },
);

test.each([
  ['ERR_AUDIO_STREAM_FORMAT', 'format'],
  ['ERR_AUDIO_STREAM_UNAVAILABLE', 'unavailable'],
  ['ERR_AUDIO_STREAM_INTERRUPTED', 'unavailable'],
  ['ERR_AUDIO_STREAM_CLEANUP', 'unavailable'],
])('原生启动 code %s 按稳定协议映射 %s', async (code, reason) => {
  stream.start.mockRejectedValueOnce({ code, message: 'not parsed' });
  const capture = openAudioCapture(input, handlers());
  await expect(capture.started).resolves.toMatchObject({
    status: 'failed',
    error: { reason },
  });
  await capture.stop();
});

test('慢 start 期间 stop 同步关采用，等待开始落定后只收尾一次；cancelled 不证明停止成功', async () => {
  const pending = deferredStart();
  stream.start.mockReturnValueOnce(pending.promise);
  stream.stop.mockImplementationOnce(() => {
    throw { code: 'ERR_AUDIO_STREAM_CLEANUP' };
  });
  const callbacks = handlers();
  const capture = openAudioCapture(input, callbacks);
  const stopped = capture.stop();
  expect(capture.stop()).toBe(stopped);
  stream.buffer();
  await Promise.resolve();
  expect(stream.stop).not.toHaveBeenCalled();
  expect(stream.release).not.toHaveBeenCalled();
  expect(callbacks.onBuffer).not.toHaveBeenCalled();
  pending.resolve();
  await expect(capture.started).resolves.toEqual({ status: 'cancelled' });
  await expect(stopped).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'unavailable' },
  });
  expect(stream.stop).toHaveBeenCalledTimes(1);
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test('早状态错误不能被迟到 start 成功覆盖，且自动收尾归原对象', async () => {
  const pending = deferredStart();
  stream.start.mockReturnValueOnce(pending.promise);
  const callbacks = handlers();
  const capture = openAudioCapture(input, callbacks);
  stream.statuses({ isStreaming: false, error: 'format' });
  stream.buffer();
  expect(callbacks.onError).not.toHaveBeenCalled();
  expect(stream.release).not.toHaveBeenCalled();
  pending.resolve();
  await expect(capture.started).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'format' },
  });
  await capture.stop();
  expect(callbacks.onBuffer).not.toHaveBeenCalled();
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test('同步 start 内部的早错误仍走 started，不漏自动收尾', async () => {
  stream.start.mockImplementationOnce(() => {
    stream.statuses({ isStreaming: false, error: 'interrupted' });
    return Promise.resolve();
  });
  const callbacks = handlers();
  const capture = openAudioCapture(input, callbacks);
  await expect(capture.started).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'unavailable' },
  });
  await capture.stop();
  expect(callbacks.onError).not.toHaveBeenCalled();
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test.each(['format', 'unavailable', 'interrupted', 'cleanup'] as const)(
  '已启动的 %s 使用原 onError 一次，即使回调抛错/重入也继续清理',
  async (error) => {
    const callbacks = handlers();
    const capture = openAudioCapture(input, callbacks);
    await capture.started;
    const onError = callbacks.onError.mockImplementation(() => {
      capture.stop();
      throw new Error('caller error');
    });
    callbacks.onError = jest.fn();
    expect(() => stream.statuses({ isStreaming: false, error })).not.toThrow();
    stream.statuses({ isStreaming: false, error });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    await capture.stop();
    expect(stream.release).toHaveBeenCalledTimes(1);
  },
);

test('onBuffer 抛错后禁止后续音频，通知一次并完成自动收尾', async () => {
  const callbacks = handlers();
  callbacks.onBuffer.mockImplementation(() => {
    throw new Error('buffer callback');
  });
  const capture = openAudioCapture(input, callbacks);
  await capture.started;
  expect(() => stream.buffer()).not.toThrow();
  stream.buffer();
  expect(callbacks.onBuffer).toHaveBeenCalledTimes(1);
  expect(callbacks.onError).toHaveBeenCalledTimes(1);
  await capture.stop();
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test.each(['stop', 'removeBuffer', 'removeStatus', 'release'] as const)(
  '%s 抛错仍执行独立清理并保留 failed；初始 false 无法代替停止回执',
  async (method) => {
    stream[method].mockImplementationOnce(() => {
      stream.calls.push(method);
      throw new Error('private native error');
    });
    const capture = openAudioCapture(input, handlers());
    await capture.started;
    const stopped = capture.stop();
    const result = await stopped;
    expect(result).toMatchObject({
      status: 'failed',
      error: { reason: 'unavailable' },
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(capture.stop()).toBe(stopped);
    expect(stream.stop).toHaveBeenCalledTimes(1);
    expect(stream.removeBuffer).toHaveBeenCalledTimes(1);
    expect(stream.removeStatus).toHaveBeenCalledTimes(1);
    expect(stream.release).toHaveBeenCalledTimes(1);
  },
);

test('停止后旧回调与迟到 start 只处理自己的对象，不影响新调用', async () => {
  const oldStream = stream;
  const pending = deferredStart();
  oldStream.start.mockReturnValueOnce(pending.promise);
  const oldCallbacks = handlers();
  const old = openAudioCapture(input, oldCallbacks);
  const oldStopped = old.stop();
  stream = new AudioStreamFixture();
  const newCallbacks = handlers();
  const current = openAudioCapture(input, newCallbacks);
  await current.started;
  oldStream.buffer();
  oldStream.statuses({ isStreaming: false, error: 'interrupted' });
  pending.resolve();
  await oldStopped;
  oldStream.buffer();
  oldStream.statuses({ isStreaming: false, error: 'cleanup' });
  expect(oldCallbacks.onBuffer).not.toHaveBeenCalled();
  expect(oldCallbacks.onError).not.toHaveBeenCalled();
  expect(stream.stop).not.toHaveBeenCalled();
  expect(stream.release).not.toHaveBeenCalled();
  stream.buffer();
  expect(newCallbacks.onBuffer).toHaveBeenCalledTimes(1);
  await current.stop();
});

test('启动失败自动释放，不依赖调用方再调用 stop', async () => {
  stream.start.mockRejectedValueOnce({ code: 'ERR_AUDIO_STREAM_FORMAT' });
  const capture = openAudioCapture(input, handlers());
  await capture.started;
  await Promise.resolve();
  expect(stream.stop).toHaveBeenCalledTimes(1);
  expect(stream.removeBuffer).toHaveBeenCalledTimes(1);
  expect(stream.removeStatus).toHaveBeenCalledTimes(1);
  expect(stream.release).toHaveBeenCalledTimes(1);
  await capture.stop();
});

test('采集中错误自动释放，不依赖调用方再调用 stop', async () => {
  const capture = openAudioCapture(input, handlers());
  await capture.started;
  stream.statuses({ isStreaming: false, error: 'interrupted' });
  await Promise.resolve();
  await Promise.resolve();
  expect(stream.stop).toHaveBeenCalledTimes(1);
  expect(stream.release).toHaveBeenCalledTimes(1);
  await capture.stop();
});

test('SDK 初始 false 状态不是启动或停止完成回执', async () => {
  const pending = deferredStart();
  stream.start.mockReturnValueOnce(pending.promise);
  const capture = openAudioCapture(input, handlers());
  const started = jest.fn();
  capture.started.then(started);
  stream.statuses({ isStreaming: false });
  await Promise.resolve();
  expect(started).not.toHaveBeenCalled();
  expect(stream.release).not.toHaveBeenCalled();
  pending.resolve();
  await expect(capture.started).resolves.toEqual({ status: 'started' });
  await capture.stop();
  expect(stream.stop).toHaveBeenCalledTimes(1);
});

test.each(['format', 'callback'] as const)(
  '开始未落定的 %s 错误走 started，并等待自己 start 后自动释放',
  async (kind) => {
    const pending = deferredStart();
    stream.start.mockReturnValueOnce(pending.promise);
    const callbacks = handlers();
    if (kind === 'callback')
      callbacks.onBuffer.mockImplementation(() => {
        throw new Error('caller');
      });
    const capture = openAudioCapture(input, callbacks);
    stream.buffer(kind === 'format' ? { encoding: undefined } : {});
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(stream.release).not.toHaveBeenCalled();
    pending.resolve();
    await expect(capture.started).resolves.toMatchObject({
      status: 'failed',
      error: { reason: kind === 'format' ? 'format' : 'unavailable' },
    });
    await Promise.resolve();
    expect(stream.release).toHaveBeenCalledTimes(1);
    await capture.stop();
  },
);

test('第二个监听安装失败也会移除第一个监听并收尾已有对象', async () => {
  stream.addListener
    .mockImplementationOnce((_event, listener) => {
      stream.buffers = listener as typeof stream.buffers;
      return { remove: stream.removeBuffer };
    })
    .mockImplementationOnce(() => {
      throw new Error('listen failed');
    });
  const capture = openAudioCapture(input, handlers());
  await expect(capture.started).resolves.toMatchObject({ status: 'failed' });
  await capture.stop();
  expect(stream.start).not.toHaveBeenCalled();
  expect(stream.removeBuffer).toHaveBeenCalledTimes(1);
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test('stop 期间 start 失败也必须继续原对象收尾，stop 结果独立报告', async () => {
  const pending = deferredStart();
  stream.start.mockReturnValueOnce(pending.promise);
  const capture = openAudioCapture(input, handlers());
  const stopped = capture.stop();
  pending.reject({ code: 'ERR_AUDIO_STREAM_UNAVAILABLE' });
  await expect(capture.started).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'unavailable' },
  });
  await expect(stopped).resolves.toEqual({ status: 'stopped' });
  expect(stream.stop).toHaveBeenCalledTimes(1);
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test('已知实际编码按事件交付，不被请求编码覆盖', async () => {
  const callbacks = handlers();
  const capture = openAudioCapture(input, callbacks);
  await capture.started;
  stream.buffer({ encoding: 'float32' });
  expect(callbacks.onBuffer).toHaveBeenCalledWith(
    expect.objectContaining({ encoding: 'float32' }),
  );
  await capture.stop();
});

test('onBuffer 内重入 stop 同步停止采用，回调随后抛错仍安全收尾', async () => {
  const callbacks = handlers();
  const capture = openAudioCapture(input, callbacks);
  await capture.started;
  callbacks.onBuffer.mockImplementation(() => {
    capture.stop();
    throw new Error('caller');
  });
  expect(() => stream.buffer()).not.toThrow();
  stream.buffer();
  expect(callbacks.onBuffer).toHaveBeenCalledTimes(1);
  expect(callbacks.onError).not.toHaveBeenCalled();
  await capture.stop();
  expect(stream.release).toHaveBeenCalledTimes(1);
});
