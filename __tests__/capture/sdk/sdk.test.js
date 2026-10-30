const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { execFileSync } = require('node:child_process');

test('Android 实际 autolinking 从源码构建已有 PCM 补丁，不采用缺少帧编码字段的预编译包', () => {
  const resolution = JSON.parse(
    execFileSync(
      process.execPath,
      [
        require.resolve('expo-modules-autolinking/bin/expo-modules-autolinking'),
        'resolve',
        '--platform',
        'android',
        '--json',
      ],
      { cwd: path.resolve(__dirname, '../../../example'), encoding: 'utf8' },
    ),
  );
  const audio = resolution.modules.find(
    (item) => item.packageName === 'expo-audio',
  );
  expect(audio).toBeDefined();
  for (const project of audio.projects)
    expect(
      (resolution.configuration?.buildFromSource ?? []).some((pattern) =>
        new RegExp(`^(?:${pattern})$`).test(project.name),
      ),
    ).toBe(true);
});

// Execute the installed package main and its real SDK wrappers. Only Expo/system
// dependencies are replaced; this does not execute native microphone code.
function loadSdk() {
  const effects = [];
  const events = new Map();
  const remove = jest.fn();
  const stream = {
    id: 'owned-stream',
    addListener: jest.fn((name, listener) => {
      events.set(name, listener);
      return { remove };
    }),
    start: jest.fn(),
    stop: jest.fn(),
    release: jest.fn(),
  };
  const NativeStream = jest.fn(() => stream);
  const native = {
    AudioStream: NativeStream,
    AudioPlayer: class {},
    AudioRecorder: class {},
  };
  const core = {
    requireNativeModule: jest.fn(() => native),
    useReleasingSharedObject: (create) => create(),
    Platform: { OS: 'ios' },
  };
  const react = {
    useEffect: (callback) => effects.push(callback),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, jest.fn()],
  };
  const modules = new Map();
  const root = path.dirname(require.resolve('expo-audio'));
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      configFile: false,
      babelrc: false,
      plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    new vm.Script(`(function(require, exports) { ${code}\n})`, {
      filename,
    }).runInThisContext()((id) => {
      if (id === 'expo' || id === 'expo-modules-core') return core;
      if (id === 'react') return react;
      if (id === 'react-native') return { Platform: core.Platform };
      if (id === 'expo-asset') return {};
      if (id.startsWith('.'))
        return load(path.resolve(path.dirname(filename), `${id}.js`));
      throw new Error(`Unexpected audio dependency: ${id}`);
    }, exports);
    return exports;
  }
  return {
    sdk: load(path.join(root, 'index.js')),
    native,
    core,
    stream,
    events,
    effects,
    remove,
  };
}

test('包根公开原生构造器，start/stop/release 回执不经过吞错包装', async () => {
  const { sdk, native, core, stream } = loadSdk();
  expect(sdk.AudioModule).toBe(native);
  expect(core.requireNativeModule).toHaveBeenCalledWith('ExpoAudio');
  const owned = new sdk.AudioModule.AudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
  });
  expect(owned).toBe(stream);
  const failure = Object.assign(new Error('controlled'), {
    code: 'ERR_AUDIO_STREAM_FORMAT',
  });
  stream.start.mockRejectedValue(failure);
  await expect(owned.start()).rejects.toBe(failure);
  stream.stop.mockImplementation(() => {
    throw failure;
  });
  expect(() => owned.stop()).toThrow(failure);
  owned.release();
  expect(stream.release).toHaveBeenCalledTimes(1);
});

test('既有 hook 真实事件接线完整传递实际 PCM 字段并移除两项监听', () => {
  const { sdk, stream, events, effects, remove } = loadSdk();
  const onBuffer = jest.fn();
  expect(
    sdk.useAudioStream({
      sampleRate: 16000,
      channels: 2,
      encoding: 'int16',
      onBuffer,
    }).stream,
  ).toBe(stream);
  const cleanup = effects[0]();
  expect([...events.keys()]).toEqual([
    'audioStreamStatus',
    'audioStreamBuffer',
  ]);
  const actual = {
    data: new ArrayBuffer(8),
    sampleRate: 48000,
    channels: 2,
    encoding: 'float32',
    timestamp: 1,
  };
  events.get('audioStreamBuffer')(actual);
  expect(onBuffer).toHaveBeenCalledWith(actual);
  expect(onBuffer.mock.calls[0][0].data).toBe(actual.data);
  expect(() =>
    events.get('audioStreamStatus')({
      isStreaming: false,
      error: 'interrupted',
    }),
  ).not.toThrow();
  cleanup();
  expect(remove).toHaveBeenCalledTimes(2);
});
