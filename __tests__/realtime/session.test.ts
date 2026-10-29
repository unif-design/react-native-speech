import {
  openSpeechSession,
  SPEECH_AUDIO_FORMAT,
} from '@unif/react-native-speech/realtime';
import type {
  SpeechSessionHandlers,
  SpeechVocabularyReader,
} from '@unif/react-native-speech/realtime';
import type {
  SpeechCredentialAccess,
  SpeechCredentialResult,
} from '@unif/react-native-speech/credentials';
import type { PcmAudioBuffer } from '@unif/react-native-speech/capture';
import { SocketFixture } from './socketFixture';

jest.mock('@unif/react-native-logger', () => ({
  ...jest.requireActual('@unif/react-native-logger'),
  createLogger: () => ({ warn: mockWarn }),
}));
const mockWarn = jest.fn();
const uuid = jest.fn(() => 'asr-task-id');
const credential = {
  token: 'temporary-secret',
  wsUrl: 'WSS://ASR.example.test/realtime',
  expiresAtSeconds: 9999999999,
};
const originalSocket = global.WebSocket;
function pcm(values: number[] = [1, 2]): PcmAudioBuffer {
  const data = new ArrayBuffer(values.length * 2);
  const view = new DataView(data);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return { ...SPEECH_AUDIO_FORMAT, data };
}
function event(name: string, extra = {}, taskId = 'asr-task-id') {
  return JSON.stringify({ header: { event: name, task_id: taskId, ...extra } });
}
function sentence(text: string, final: boolean, id?: number) {
  return JSON.stringify({
    header: { event: 'result-generated', task_id: 'asr-task-id' },
    payload: {
      output: {
        sentence: {
          text,
          sentence_end: final,
          ...(id === undefined ? {} : { sentence_id: id }),
        },
      },
    },
  });
}
function setup(readVocabulary?: SpeechVocabularyReader) {
  let resolve!: (result: SpeechCredentialResult) => void;
  let reject!: (error: unknown) => void;
  const access: SpeechCredentialAccess = {
    get: jest.fn(
      () =>
        new Promise((done, failed) => {
          resolve = done;
          reject = failed;
        }),
    ),
    invalidate: jest.fn(),
    dispose: jest.fn(),
  };
  const handlers: SpeechSessionHandlers = {
    onStarted: jest.fn(),
    onPartial: jest.fn(),
    onFinal: jest.fn(),
    onFinished: jest.fn(),
    onError: jest.fn(),
  };
  const input = {
    createUuid: uuid,
    credentials: access,
    ...(readVocabulary ? { readVocabulary } : {}),
  };
  const session = openSpeechSession(input, handlers);
  const ready = async () => {
    resolve({ status: 'success', credential });
    await Promise.resolve();
    await Promise.resolve();
    return SocketFixture.instances[SocketFixture.instances.length - 1];
  };
  return { access, input, handlers, session, ready, resolve, reject };
}
function assertReleased(socket: SocketFixture) {
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(socket.listenerCount).toBe(0);
}
beforeEach(() => {
  SocketFixture.instances = [];
  SocketFixture.failAt = '';
  global.WebSocket = SocketFixture as unknown as typeof WebSocket;
  uuid.mockReturnValue('asr-task-id');
});
afterEach(() => {
  global.WebSocket = originalSocket;
});

test('本轮目录与凭证准备完成后才发送识别热词，保留已接纳的音频', async () => {
  let finish!: (words: readonly string[]) => void;
  const words = new Promise<readonly string[]>((resolve) => {
    finish = resolve;
  });
  const readVocabulary = jest.fn(() => words);
  const f = setup(readVocabulary);
  f.session.sendAudio(pcm([27]));
  await f.ready();
  expect(SocketFixture.instances).toHaveLength(0);
  finish(['小茗同学', '新饮品名称']);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const socket = SocketFixture.instances.at(-1)!;
  socket.emit('open');
  expect(
    JSON.parse(socket.sent[0] as string).payload.parameters.vocabulary,
  ).toEqual({
    小茗同学: 4,
    新饮品名称: 4,
  });
  socket.emit('message', event('task-started'));
  expect(new DataView(socket.sent[1] as ArrayBuffer).getInt16(0, true)).toBe(
    27,
  );
  f.session.close();
  expect(readVocabulary.mock.calls).toHaveLength(1);
});

test('取消识别同时取消目录读取，迟到词表不会再创建 WebSocket', async () => {
  let finish!: (words: readonly string[]) => void;
  const words = new Promise<readonly string[]>((resolve) => {
    finish = resolve;
  });
  const readVocabulary = jest.fn<
    Promise<readonly string[]>,
    [{ signal: AbortSignal }]
  >(() => words);
  const f = setup(readVocabulary);
  await f.ready();
  f.session.close();
  expect(readVocabulary.mock.calls[0][0].signal.aborted).toBe(true);
  finish(['旧客户商品']);
  await words;
  await Promise.resolve();
  expect(SocketFixture.instances).toHaveLength(0);
  expect(f.handlers.onError).not.toHaveBeenCalled();
});

test('immediate handle, one credentials wait, native normalized URL and header, queued accepted bytes then finish once', async () => {
  const { session, access, handlers, ready } = setup();
  expect(SocketFixture.instances).toHaveLength(0);
  const first = pcm([11]);
  session.sendAudio(first);
  new DataView(first.data).setInt16(0, 99, true);
  const socket = await ready();
  expect(socket.url).toBe('wss://asr.example.test/realtime');
  expect(socket.options).toEqual({
    headers: { Authorization: 'Bearer temporary-secret' },
  });
  expect(socket.url).not.toContain(credential.token);
  expect(access.get).toHaveBeenCalledTimes(1);
  session.sendAudio(pcm([22]));
  session.finish();
  session.finish();
  session.sendAudio(pcm([33]));
  socket.emit('open');
  socket.emit('open');
  expect(socket.sent).toHaveLength(1);
  expect(JSON.parse(socket.sent[0] as string)).toMatchObject({
    header: { action: 'run-task', task_id: 'asr-task-id' },
    payload: { parameters: { format: 'pcm', sample_rate: 16000 } },
  });
  socket.emit('message', event('task-started', {}, 'other'));
  expect(socket.sent).toHaveLength(1);
  socket.emit('message', event('task-started'));
  socket.emit('message', event('task-started'));
  expect(socket.sent).toHaveLength(4);
  expect(new DataView(socket.sent[1] as ArrayBuffer).getInt16(0, true)).toBe(
    11,
  );
  expect(new DataView(socket.sent[2] as ArrayBuffer).getInt16(0, true)).toBe(
    22,
  );
  expect(JSON.parse(socket.sent[3] as string).header.action).toBe(
    'finish-task',
  );
  expect(handlers.onStarted).toHaveBeenCalledTimes(1);
  socket.emit('message', event('task-finished'));
  expect(handlers.onFinished).toHaveBeenCalledTimes(1);
  assertReleased(socket);
});

test.each(['sendAudio', 'finish', 'close'] as const)(
  'onStarted reentrant %s respects queue and adoption',
  async (action) => {
    const { session, handlers, ready } = setup();
    session.sendAudio(pcm([10]));
    jest.mocked(handlers.onStarted).mockImplementation(() => {
      if (action === 'sendAudio') session.sendAudio(pcm([20]));
      else session[action]();
    });
    const socket = await ready();
    socket.emit('open');
    socket.emit('message', event('task-started'));
    if (action === 'close') {
      assertReleased(socket);
      expect(socket.sent).toHaveLength(1);
    } else {
      expect(
        new DataView(socket.sent[1] as ArrayBuffer).getInt16(0, true),
      ).toBe(10);
      if (action === 'sendAudio')
        expect(
          new DataView(socket.sent[2] as ArrayBuffer).getInt16(0, true),
        ).toBe(20);
      else
        expect(JSON.parse(socket.sent[2] as string).header.action).toBe(
          'finish-task',
        );
      session.close();
    }
  },
);

test('flush synchronous reentry sends accepted frames before finish, and immediate send preserves ArrayBuffer', async () => {
  const { session, ready } = setup();
  session.sendAudio(pcm([10]));
  session.sendAudio(pcm([20]));
  const socket = await ready();
  socket.emit('open');
  socket.onSend = (data) => {
    if (data instanceof ArrayBuffer) {
      session.sendAudio(pcm([30]));
      session.finish();
    }
  };
  socket.emit('message', event('task-started'));
  expect(
    socket.sent.map((data) =>
      typeof data === 'string'
        ? JSON.parse(data).header.action
        : new DataView(data).getInt16(0, true),
    ),
  ).toEqual(['run-task', 10, 20, 30, 'finish-task']);
  session.close();
  const next = setup();
  const ownSocket = await next.ready();
  ownSocket.emit('open');
  ownSocket.emit('message', event('task-started'));
  const audio = pcm();
  next.session.sendAudio(audio);
  expect(ownSocket.sent[1]).toBe(audio.data);
  next.session.close();
});

test('close cancels only own pending get, late credential cannot connect, shared access is retained', async () => {
  const { session, access, handlers, ready } = setup();
  const signal = jest.mocked(access.get).mock.calls[0][0]?.signal;
  session.close();
  session.close();
  await ready();
  expect(signal?.aborted).toBe(true);
  expect(access.dispose).not.toHaveBeenCalled();
  expect(SocketFixture.instances).toHaveLength(0);
  expect(uuid).not.toHaveBeenCalled();
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(handlers.onFinished).not.toHaveBeenCalled();
});

test.each(['cancelled', 'failed'] as const)(
  'active credential %s ends as credential error',
  async (status) => {
    const { resolve, handlers } = setup();
    resolve(
      status === 'cancelled'
        ? { status }
        : { status, reason: 'access', message: 'raw secret' },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(handlers.onError).toHaveBeenCalledWith({
      reason: 'credential',
      message: expect.any(String),
    });
    expect(SocketFixture.instances).toHaveLength(0);
  },
);

test.each([
  'get-throw',
  'get-reject',
  'uuid',
  'constructor',
  'binaryType',
  'listen:open',
  'listen:message',
  'listen:error',
  'listen:close',
])('boundary %s converges once and cleans socket', async (boundary) => {
  const handlers = {
    onStarted: jest.fn(),
    onPartial: jest.fn(),
    onFinal: jest.fn(),
    onFinished: jest.fn(),
    onError: jest.fn(),
  };
  const access = {
    get: jest.fn(() =>
      Promise.resolve({ status: 'success' as const, credential }),
    ),
    invalidate: jest.fn(),
    dispose: jest.fn(),
  };
  if (boundary === 'get-throw')
    access.get.mockImplementation(() => {
      throw new Error('secret');
    });
  if (boundary === 'get-reject')
    access.get.mockRejectedValue(new Error('secret'));
  if (boundary === 'uuid')
    uuid.mockImplementation(() => {
      throw new Error('secret');
    });
  SocketFixture.failAt = boundary;
  expect(() =>
    openSpeechSession({ credentials: access, createUuid: uuid }, handlers),
  ).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(handlers.onError).toHaveBeenCalledTimes(1);
  expect(handlers.onFinished).not.toHaveBeenCalled();
  expect(JSON.stringify(handlers.onError.mock.calls)).not.toContain('secret');
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      phase: boundary.startsWith('get-') ? 'prepare' : 'connect',
      fields: expect.objectContaining({ errorType: 'Error' }),
    }),
  );
  for (const socket of SocketFixture.instances) assertReleased(socket);
});

test.each([
  { sampleRate: 8000 },
  { channels: 2 },
  { encoding: 'float32' },
  { data: new ArrayBuffer(3) },
  { data: 'not-pcm' },
])('rejects actual invalid format %p', async (invalid) => {
  const { session, handlers, ready, access } = setup();
  const socket = await ready();
  session.sendAudio({ ...pcm(), ...invalid } as PcmAudioBuffer);
  expect(handlers.onError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'audio_format' }),
  );
  assertReleased(socket);
  expect(access.invalidate).not.toHaveBeenCalled();
});

test('empty chunk is ignored, text snapshots are unmodified, final identity only deduplicates same id', async () => {
  const { session, handlers, ready } = setup();
  session.sendAudio(pcm([]));
  const socket = await ready();
  socket.emit('open');
  socket.emit('message', event('task-started'));
  session.sendAudio(pcm([]));
  expect(socket.sent).toHaveLength(1);
  socket.emit('message', sentence(' 你', false));
  socket.emit('message', sentence('', false));
  for (const id of [1, 1, 2, undefined, undefined])
    socket.emit('message', sentence('同文', true, id));
  expect(jest.mocked(handlers.onPartial).mock.calls).toEqual([[' 你'], ['']]);
  expect(jest.mocked(handlers.onFinal).mock.calls).toEqual([
    ['同文'],
    ['同文'],
    ['同文'],
    ['同文'],
  ]);
  session.close();
});

test.each([
  'InvalidApiKey',
  'invalid_api_key',
  'AccessDenied',
  'client_error',
  undefined,
])('task-failed %s invalidates only exact auth rejection', async (code) => {
  const { handlers, ready, access } = setup();
  const socket = await ready();
  socket.emit(
    'message',
    event(
      'task-failed',
      code === undefined
        ? {}
        : { error_code: code, error_message: 'raw secret' },
    ),
  );
  expect(handlers.onError).toHaveBeenCalledWith({
    reason: 'rejected',
    message: expect.any(String),
    ...(code === undefined ? {} : { sourceCode: code }),
  });
  expect(access.invalidate).toHaveBeenCalledTimes(
    code === 'InvalidApiKey' || code === 'invalid_api_key' ? 1 : 0,
  );
  if (code === 'InvalidApiKey' || code === 'invalid_api_key')
    expect(access.invalidate).toHaveBeenCalledWith(credential);
  assertReleased(socket);
});

test.each([
  'error',
  'close',
  'protocol',
  'send-start',
  'send-audio',
  'send-finish',
])('%s yields one failure, no invalidation or retry', async (mode) => {
  const { session, ready, handlers, access } = setup();
  const socket = await ready();
  if (mode.startsWith('send-')) {
    if (mode !== 'send-start') {
      socket.emit('open');
      socket.emit('message', event('task-started'));
    }
    SocketFixture.failAt = 'send';
    if (mode === 'send-start') socket.emit('open');
    if (mode === 'send-audio') session.sendAudio(pcm());
    if (mode === 'send-finish') session.finish();
  } else if (mode === 'protocol') socket.emit('message', '{}');
  else socket.emit(mode);
  socket.emit('message', event('task-finished'));
  socket.emit('error');
  expect(handlers.onError).toHaveBeenCalledTimes(1);
  expect(handlers.onFinished).not.toHaveBeenCalled();
  expect(access.invalidate).not.toHaveBeenCalled();
  expect(access.get).toHaveBeenCalledTimes(1);
  assertReleased(socket);
});

test.each([
  'onStarted',
  'onPartial',
  'onFinal',
  'onFinished',
  'onError',
] as const)(
  '%s throw never leaks or delivers a second terminal',
  async (name) => {
    const { session, ready, handlers } = setup();
    const socket = await ready();
    jest.mocked(handlers[name]).mockImplementation(() => {
      throw new Error('consumer private text');
    });
    socket.emit('open');
    expect(() => {
      if (name === 'onStarted') socket.emit('message', event('task-started'));
      if (name === 'onPartial') socket.emit('message', sentence('text', false));
      if (name === 'onFinal') socket.emit('message', sentence('text', true));
      if (name === 'onFinished') socket.emit('message', event('task-finished'));
      if (name === 'onError') socket.emit('error');
    }).not.toThrow();
    assertReleased(socket);
    socket.emit('error');
    socket.emit('message', event('task-finished'));
    session.close();
    expect(
      jest.mocked(handlers.onError).mock.calls.length +
        jest.mocked(handlers.onFinished).mock.calls.length,
    ).toBeLessThanOrEqual(1);
  },
);

test('input and handlers captured per invocation, early finished cleans before callback, late events ignored', async () => {
  const { session, input, handlers, ready, access } = setup();
  const original = { ...handlers };
  const replacement = jest.fn();
  for (const key of Object.keys(handlers) as (keyof SpeechSessionHandlers)[])
    handlers[key] = replacement;
  input.credentials = {
    get: jest.fn(),
    invalidate: jest.fn(),
    dispose: jest.fn(),
  };
  const socket = await ready();
  jest.mocked(original.onFinished).mockImplementation(() => {
    assertReleased(socket);
    session.sendAudio(pcm());
    session.finish();
    socket.emit('error');
  });
  socket.emit('message', event('task-started'));
  socket.emit('message', sentence('', false));
  socket.emit('message', sentence('', true));
  socket.emit('message', event('task-finished'));
  socket.emit('message', sentence('late', true));
  expect(original.onStarted).toHaveBeenCalledTimes(1);
  expect(original.onPartial).toHaveBeenCalledWith('');
  expect(original.onFinal).toHaveBeenCalledWith('');
  expect(original.onFinished).toHaveBeenCalledTimes(1);
  expect(original.onError).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled();
  expect(access.get).toHaveBeenCalledTimes(1);
});

test('cleanup close throw does not prevent normal terminal or repeat close', async () => {
  const { ready, handlers, session } = setup();
  const socket = await ready();
  SocketFixture.failAt = 'close';
  expect(() => socket.emit('message', event('task-finished'))).not.toThrow();
  session.close();
  assertReleased(socket);
  expect(handlers.onFinished).toHaveBeenCalledTimes(1);
  expect(handlers.onError).not.toHaveBeenCalled();
});

test.each(['close', 'finish', 'throw'] as const)(
  'queue flush %s reentry stops or finishes the owned queue exactly',
  async (mode) => {
    const { session, handlers, ready } = setup();
    session.sendAudio(pcm([1]));
    session.sendAudio(pcm([2]));
    const socket = await ready();
    socket.emit('open');
    socket.onSend = (data) => {
      if (!(data instanceof ArrayBuffer)) return;
      if (mode === 'throw') throw new Error('raw secret');
      session[mode]();
    };
    socket.emit('message', event('task-started'));
    if (mode === 'finish')
      expect(
        socket.sent.map((data) =>
          typeof data === 'string'
            ? JSON.parse(data).header.action
            : new DataView(data).getInt16(0, true),
        ),
      ).toEqual(['run-task', 1, 2, 'finish-task']);
    else {
      expect(socket.sent).toHaveLength(2);
      assertReleased(socket);
      expect(handlers.onError).toHaveBeenCalledTimes(mode === 'throw' ? 1 : 0);
    }
    session.close();
  },
);

test('invalidation throw still delivers rejected after cleanup and uses captured access', async () => {
  const { input, access, handlers, ready, session } = setup();
  const socket = await ready();
  input.credentials = {
    get: jest.fn(),
    invalidate: jest.fn(),
    dispose: jest.fn(),
  };
  jest.mocked(access.invalidate).mockImplementation(() => {
    assertReleased(socket);
    session.close();
    throw new Error('raw secret');
  });
  jest.mocked(handlers.onError).mockImplementation(() => {
    assertReleased(socket);
    socket.emit('message', event('task-finished'));
  });
  socket.emit('message', event('task-failed', { error_code: 'InvalidApiKey' }));
  expect(access.invalidate).toHaveBeenCalledWith(credential);
  expect(input.credentials.invalidate).not.toHaveBeenCalled();
  expect(handlers.onError).toHaveBeenCalledTimes(1);
  expect(handlers.onFinished).not.toHaveBeenCalled();
});

test('two sessions sharing access own distinct cancellation and connection lifetimes', async () => {
  const first = setup();
  const secondHandlers = {
    ...first.handlers,
    onError: jest.fn(),
    onFinished: jest.fn(),
  };
  let secondResolve!: (result: SpeechCredentialResult) => void;
  jest.mocked(first.access.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        secondResolve = resolve;
      }),
  );
  const second = openSpeechSession(first.input, secondHandlers);
  const calls = jest.mocked(first.access.get).mock.calls;
  first.session.close();
  expect(calls[0][0]?.signal?.aborted).toBe(true);
  expect(calls[1][0]?.signal?.aborted).toBe(false);
  secondResolve({ status: 'success', credential });
  await Promise.resolve();
  await Promise.resolve();
  expect(SocketFixture.instances).toHaveLength(1);
  expect(first.access.dispose).not.toHaveBeenCalled();
  SocketFixture.instances[0].emit('message', event('task-finished'));
  expect(secondHandlers.onFinished).toHaveBeenCalledTimes(1);
  expect(first.handlers.onFinished).not.toHaveBeenCalled();
  second.close();
});

test('heartbeat, extension and other task messages do not deliver text or close', async () => {
  const { session, handlers, ready } = setup();
  const socket = await ready();
  socket.emit(
    'message',
    JSON.stringify({
      header: { event: 'result-generated', task_id: 'asr-task-id' },
      payload: { output: { sentence: { heartbeat: true } } },
    }),
  );
  socket.emit('message', event('extension-added'));
  socket.emit('message', event('task-failed', {}, 'different'));
  expect(handlers.onPartial).not.toHaveBeenCalled();
  expect(handlers.onFinal).not.toHaveBeenCalled();
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(socket.close).not.toHaveBeenCalled();
  session.close();
});

test.each(['onPartial', 'onFinal'] as const)(
  '%s callback can close and suppress all remaining events',
  async (name) => {
    const { session, handlers, ready } = setup();
    const socket = await ready();
    jest.mocked(handlers[name]).mockImplementation(() => session.close());
    socket.emit('message', sentence('本句', name === 'onFinal', 1));
    socket.emit('message', sentence('迟到', true, 2));
    socket.emit('message', event('task-finished'));
    expect(handlers[name]).toHaveBeenCalledTimes(1);
    expect(handlers.onFinished).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    assertReleased(socket);
  },
);

test('finish during credential wait still allows exactly one protocol finish after empty start', async () => {
  const { session, ready } = setup();
  session.finish();
  session.finish();
  session.sendAudio(pcm());
  const socket = await ready();
  socket.emit('open');
  expect(socket.sent).toHaveLength(1);
  socket.emit('message', event('task-started'));
  session.finish();
  expect(
    socket.sent.map((data) => JSON.parse(data as string).header.action),
  ).toEqual(['run-task', 'finish-task']);
  session.close();
});

test('invalid audio during credential preparation closes adoption and blocks late socket', async () => {
  const { session, ready, handlers } = setup();
  session.sendAudio({ ...pcm(), sampleRate: 8000 });
  await ready();
  expect(handlers.onError).toHaveBeenCalledTimes(1);
  expect(SocketFixture.instances).toHaveLength(0);
});

test('语音开始后立即停止不会再请求词表，原音频仍按协议发送', async () => {
  const readVocabulary = jest.fn().mockResolvedValue(['不应请求']);
  const f = setup(readVocabulary);
  f.session.sendAudio(pcm([3]));
  f.session.finish();
  await f.ready();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(readVocabulary).not.toHaveBeenCalled();
  const socket = SocketFixture.instances[0];
  socket.emit('open');
  socket.emit('message', event('task-started'));
  expect(socket.sent.some((value) => value instanceof ArrayBuffer)).toBe(true);
  expect(
    JSON.parse(socket.sent[0] as string).payload.parameters.vocabulary,
  ).toBeUndefined();
  f.session.close();
});

test('WebSocket error retains only safe cause and session state', async () => {
  const { handlers, ready } = setup();
  const socket = await ready();
  socket.emit('open');
  for (const listener of socket.listeners.get('error') ?? [])
    listener({
      type: 'error',
      code: 'ECONNRESET',
      message: 'private-speech-token',
      url: credential.wsUrl,
    });
  expect(handlers.onError).toHaveBeenCalledTimes(1);
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      context: expect.objectContaining({ operationId: expect.any(String) }),
      phase: 'transport',
      fields: expect.objectContaining({
        operation: 'socket_error',
        status: 'opened',
        reason: 'connection_reset',
        sourceCode: 'ECONNRESET',
      }),
    }),
  );
  expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
    /private-speech-token|ASR.example/,
  );
  assertReleased(socket);
});

test.each([1000, 1006, 1011, '1006', 999, 5000, NaN, Infinity])(
  'WebSocket close logs only valid numeric code %s without reason or message',
  async (code) => {
    const { ready, handlers } = setup();
    const socket = await ready();
    for (const listener of socket.listeners.get('close') ?? [])
      listener({
        type: 'close',
        code,
        reason: 'private-recognition-text',
        message: 'private-audio',
        wasClean: true,
      });
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const metadata = mockWarn.mock.calls[0][1];
    expect(metadata).toMatchObject({
      phase: 'transport',
      fields: { operation: 'socket_close', reason: 'socket_closed' },
    });
    if (typeof code === 'number' && [1000, 1006, 1011].includes(code))
      expect(metadata.fields.sourceCode).toBe(code);
    else expect(metadata.fields).not.toHaveProperty('sourceCode');
    expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
      /private-recognition-text|private-audio/,
    );
    assertReleased(socket);
  },
);

test.each([
  'InvalidApiKey',
  'invalid_api_key',
  'private-token',
  'https://private-host/path',
])(
  'provider rejection %s keeps caller result but log accepts only known auth codes',
  async (sourceCode) => {
    const { ready, handlers } = setup();
    const socket = await ready();
    socket.emit(
      'message',
      event('task-failed', {
        error_code: sourceCode,
        error_message: 'private-result',
      }),
    );
    expect(handlers.onError).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rejected', sourceCode }),
    );
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const metadata = mockWarn.mock.calls[0][1];
    expect(metadata).toMatchObject({
      phase: 'receive',
      fields: { operation: 'provider_rejection', reason: 'rejected' },
    });
    if (sourceCode === 'InvalidApiKey' || sourceCode === 'invalid_api_key')
      expect(metadata.fields.sourceCode).toBe(sourceCode);
    else expect(metadata.fields).not.toHaveProperty('sourceCode');
    expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
      /private-token|private-host|private-result/,
    );
  },
);

test.each(['send-start', 'send-audio', 'send-finish'] as const)(
  '%s logs raw failure before retaining the existing single terminal',
  async (operation) => {
    const { ready, session, handlers } = setup();
    const socket = await ready();
    if (operation !== 'send-start') {
      socket.emit('open');
      socket.emit('message', event('task-started'));
    }
    SocketFixture.failAt = 'send';
    if (operation === 'send-start') socket.emit('open');
    else if (operation === 'send-audio') session.sendAudio(pcm());
    else session.finish();
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledWith(
      'speech.session.failed',
      expect.objectContaining({
        phase: 'send',
        fields: expect.objectContaining({
          operation: operation.replace('-', '_'),
          errorType: 'Error',
        }),
      }),
    );
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain(
      'private diagnostic',
    );
    assertReleased(socket);
  },
);

test('cleanup and callback failures stay distinct and preserve normal finish delivery', async () => {
  const { ready, handlers } = setup();
  const socket = await ready();
  SocketFixture.failAt = 'close';
  jest.mocked(handlers.onFinished).mockImplementationOnce(() => {
    throw new TypeError('private-callback');
  });
  expect(() => socket.emit('message', event('task-finished'))).not.toThrow();
  expect(handlers.onFinished).toHaveBeenCalledTimes(1);
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(mockWarn).toHaveBeenCalledTimes(2);
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      phase: 'cleanup',
      fields: expect.objectContaining({
        operation: 'close_socket',
        errorType: 'Error',
      }),
    }),
  );
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      phase: 'callback',
      fields: expect.objectContaining({
        operation: 'on_finished',
        errorType: 'TypeError',
      }),
    }),
  );
  expect(JSON.stringify(mockWarn.mock.calls)).not.toMatch(
    /private diagnostic|private-callback/,
  );
});

test('progress observer failure is logged without a second terminal callback', async () => {
  const { ready, handlers } = setup();
  const socket = await ready();
  jest.mocked(handlers.onPartial).mockImplementationOnce(() => {
    throw new Error('private-transcript');
  });
  socket.emit('message', sentence('private-transcript', false));
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      phase: 'callback',
      fields: expect.objectContaining({
        operation: 'on_partial',
        errorType: 'Error',
      }),
    }),
  );
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(handlers.onFinished).not.toHaveBeenCalled();
  expect(JSON.stringify(mockWarn.mock.calls)).not.toContain(
    'private-transcript',
  );
  assertReleased(socket);
});

test('vocabulary failure records fallback without logging its words, cancellation stays quiet', async () => {
  const readVocabulary = jest
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error('private-vocabulary'), { code: 'ETIMEDOUT' }),
    );
  const first = setup(readVocabulary);
  await first.ready();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const socket = SocketFixture.instances.at(-1)!;
  socket.emit('open');
  expect(
    JSON.parse(socket.sent[0] as string).payload.parameters,
  ).not.toHaveProperty('vocabulary');
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      phase: 'prepare',
      fields: expect.objectContaining({
        operation: 'read_vocabulary',
        sourceCode: 'ETIMEDOUT',
      }),
    }),
  );
  first.session.close();
  mockWarn.mockClear();
  const second = setup();
  second.session.close();
  await second.ready();
  const third = setup();
  const ended = await third.ready();
  ended.emit('message', event('task-finished'));
  expect(mockWarn).not.toHaveBeenCalled();
});

test('unreadable close code cannot prevent the original terminal and cleanup', async () => {
  const { ready, handlers } = setup();
  const socket = await ready();
  const close = {
    get code() {
      throw new Error('private-code');
    },
  };
  expect(() => {
    for (const listener of socket.listeners.get('close') ?? []) listener(close);
  }).not.toThrow();
  expect(handlers.onError).toHaveBeenCalledTimes(1);
  expect(mockWarn).toHaveBeenCalledTimes(1);
  expect(mockWarn.mock.calls[0][1].fields).not.toHaveProperty('sourceCode');
  assertReleased(socket);
});

test('audio preparation exception records its safe type without reading or retaining PCM', async () => {
  const { ready, handlers, session } = setup();
  const socket = await ready();
  session.sendAudio({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
    get data(): ArrayBuffer {
      throw new TypeError('private-pcm');
    },
  });
  expect(handlers.onError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'audio_format' }),
  );
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      phase: 'prepare',
      fields: expect.objectContaining({
        operation: 'read_audio',
        errorType: 'TypeError',
      }),
    }),
  );
  expect(JSON.stringify(mockWarn.mock.calls)).not.toContain('private-pcm');
  assertReleased(socket);
});

test('invalid protocol records only the receive classification and retains its single terminal', async () => {
  const { ready, handlers } = setup();
  const socket = await ready();
  socket.emit('message', 'private-invalid-protocol');
  expect(handlers.onError).toHaveBeenCalledTimes(1);
  expect(handlers.onError).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'protocol' }),
  );
  expect(mockWarn).toHaveBeenCalledWith(
    'speech.session.failed',
    expect.objectContaining({
      phase: 'receive',
      fields: expect.objectContaining({
        operation: 'read_event',
        reason: 'protocol',
      }),
    }),
  );
  expect(JSON.stringify(mockWarn.mock.calls)).not.toContain(
    'private-invalid-protocol',
  );
  assertReleased(socket);
});

test('callbacks retained by the transport after close cannot log or deliver another terminal', async () => {
  const { ready, handlers, session } = setup();
  const socket = await ready();
  const lateError = [...socket.listeners.get('error')!][0];
  const lateClose = [...socket.listeners.get('close')!][0];
  const lateMessage = [...socket.listeners.get('message')!][0];
  session.close();
  lateError({ code: 'ECONNRESET', message: 'private-late-error' });
  lateClose({ code: 1006, reason: 'private-late-close' });
  lateMessage({ data: event('task-failed', { error_code: 'InvalidApiKey' }) });
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(handlers.onFinished).not.toHaveBeenCalled();
  expect(mockWarn).not.toHaveBeenCalled();
  assertReleased(socket);
});

test('credential rejection after close does not create a socket, failure callback, or warning', async () => {
  const { handlers, session, reject } = setup();
  session.close();
  reject(new Error('private-late-credential'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(SocketFixture.instances).toHaveLength(0);
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(handlers.onFinished).not.toHaveBeenCalled();
  expect(mockWarn).not.toHaveBeenCalled();
});

test.each(['start', 'audio', 'finish'] as const)(
  'synchronous close while sending %s suppresses a later SDK exception without repeating cleanup',
  async (operation) => {
    const { ready, handlers, session } = setup();
    const socket = await ready();
    if (operation !== 'start') {
      socket.emit('open');
      socket.emit('message', event('task-started'));
    }
    socket.onSend = () => {
      session.close();
      throw new Error('private-after-close');
    };
    if (operation === 'start') socket.emit('open');
    else if (operation === 'audio') session.sendAudio(pcm());
    else session.finish();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onFinished).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
    assertReleased(socket);
  },
);

test('audio adapter closing its owner before throwing cannot turn cancellation into a failure', async () => {
  const { ready, handlers, session } = setup();
  const socket = await ready();
  session.sendAudio({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
    get data(): ArrayBuffer {
      session.close();
      throw new TypeError('private-ended-audio');
    },
  });
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(mockWarn).not.toHaveBeenCalled();
  assertReleased(socket);
});

test('vocabulary rejection queued before stop uses the existing fallback without a cancellation warning', async () => {
  let reject!: (error: unknown) => void;
  const words = new Promise<readonly string[]>((_resolve, failed) => {
    reject = failed;
  });
  const readVocabulary = jest.fn(() => words);
  const { ready, session, handlers } = setup(readVocabulary);
  await ready();
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(readVocabulary).toHaveBeenCalledTimes(1);
  reject(new Error('private-cancelled-words'));
  session.finish();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const socket = SocketFixture.instances.at(-1)!;
  socket.emit('open');
  socket.emit('message', event('task-started'));
  expect(
    socket.sent.map((command) => JSON.parse(command as string).header.action),
  ).toEqual(['run-task', 'finish-task']);
  expect(
    JSON.parse(socket.sent[0] as string).payload.parameters,
  ).not.toHaveProperty('vocabulary');
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(mockWarn).not.toHaveBeenCalled();
  session.close();
  assertReleased(socket);
});

test('a socket adapter closing during listener setup keeps its later exception silent', async () => {
  const { ready, session, handlers } = setup();
  const addListener = SocketFixture.prototype.addEventListener;
  jest
    .spyOn(SocketFixture.prototype, 'addEventListener')
    .mockImplementationOnce(function (this: SocketFixture, type, listener) {
      addListener.call(this, type, listener);
      session.close();
      throw new Error('private-ended-listener');
    });
  const socket = await ready();
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(handlers.onFinished).not.toHaveBeenCalled();
  expect(mockWarn).not.toHaveBeenCalled();
  assertReleased(socket);
});
