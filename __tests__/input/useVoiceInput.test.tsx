import { act, renderHook } from '@testing-library/react-native';
import { openAudioCapture } from '@unif/react-native-speech/capture';
import { useVoiceInput } from '@unif/react-native-speech/input';
import { capture, dependencies, deferred } from './fixture';
jest.mock('@unif/react-native-speech/capture', () => ({
  openAudioCapture: jest.fn(),
}));
const openCapture = jest.mocked(openAudioCapture);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('request一次后只读microphone，采集started而非识别握手才进入listening', async () => {
  const deps = dependencies();
  const permission = deferred<void>();
  deps.permissions.request.mockReturnValue(permission.promise);
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(() => {
    view.result.current.start();
    view.result.current.start();
  });
  expect(view.result.current.state).toBe('starting');
  expect(openCapture).not.toHaveBeenCalled();
  await act(async () => {
    permission.resolve();
  });
  expect(deps.permissions.request).toHaveBeenCalledTimes(1);
  expect(deps.permissions.request).toHaveBeenCalledWith('microphone');
  expect(deps.permissions.read).toHaveBeenCalledWith(['microphone']);
  expect(openCapture).toHaveBeenCalledWith(
    { sampleRate: 16000, channels: 1, encoding: 'int16' },
    expect.any(Object),
  );
  await act(() => deps.handlers.onStarted());
  expect(view.result.current.state).toBe('starting');
  await act(async () => mic.started.resolve({ status: 'started' }));
  expect(view.result.current.state).toBe('listening');
  await act(() => view.result.current.cancel());
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
});

test('partial覆盖，final追加并清partial，正常结果等待采集停止和识别完成', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  await act(async () => mic.started.resolve({ status: 'started' }));
  expect(deps.openRecognition).toHaveBeenCalledTimes(1);
  await act(() => {
    deps.handlers.onPartial('你');
    deps.handlers.onPartial('你好');
    deps.handlers.onFinal('好');
    deps.handlers.onFinal('好');
    deps.handlers.onPartial('呀');
  });
  expect(view.result.current.transcript).toBe('好好呀');
  await act(() => {
    view.result.current.stop();
    view.result.current.stop();
  });
  expect(view.result.current.state).toBe('finishing');
  expect(mic.handle.stop).toHaveBeenCalledTimes(1);
  expect(deps.session.finish).toHaveBeenCalledTimes(1);
  await act(() => {
    deps.handlers.onFinal('呀');
    deps.handlers.onFinished();
  });
  expect(deps.onResult).not.toHaveBeenCalled();
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(deps.onResult).toHaveBeenCalledTimes(1);
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'text',
    text: '好好呀',
    completion: 'confirmed',
  });
  expect(view.result.current.state).toBe('idle');
});

test.each(['blocked', 'limited', 'unavailable', 'requestable'] as const)(
  '权限%s不启动资源',
  async (status) => {
    const deps = dependencies();
    deps.permissions.read.mockResolvedValue([
      { id: 'microphone', label: '麦克风', status },
    ]);
    const view = await renderHook(() => useVoiceInput(deps));
    await act(async () => view.result.current.start());
    expect(deps.onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        reason: 'permission',
        finalText: '',
      }),
    );
    expect(openCapture).not.toHaveBeenCalled();
    expect(deps.openRecognition).not.toHaveBeenCalled();
  },
);

test('权限等待中stop返回空unconfirmed，迟到授权不打开资源', async () => {
  const deps = dependencies();
  const permission = deferred<void>();
  deps.permissions.request.mockReturnValue(permission.promise);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  await act(() => view.result.current.stop());
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'text',
    text: '',
    completion: 'unconfirmed',
  });
  await act(async () => permission.resolve());
  expect(deps.permissions.read).not.toHaveBeenCalled();
  expect(openCapture).not.toHaveBeenCalled();
});

test('60秒从授权通过计时，2秒只结束识别等待而不替代采集停止', async () => {
  const deps = dependencies();
  const permission = deferred<void>();
  deps.permissions.request.mockReturnValue(permission.promise);
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  await act(() => jest.advanceTimersByTime(90000));
  expect(deps.onResult).not.toHaveBeenCalled();
  await act(async () => {
    permission.resolve();
  });
  await act(async () => mic.started.resolve({ status: 'started' }));
  await act(() => {
    deps.handlers.onFinal('定稿');
    deps.handlers.onPartial('未定稿');
    jest.advanceTimersByTime(59999);
  });
  expect(view.result.current.state).toBe('listening');
  await act(() => jest.advanceTimersByTime(1));
  expect(view.result.current.state).toBe('finishing');
  await act(() => jest.advanceTimersByTime(1999));
  expect(deps.session.close).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expect(deps.session.close).toHaveBeenCalledTimes(1);
  expect(deps.onResult).not.toHaveBeenCalled();
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'text',
    text: '定稿未定稿',
    completion: 'unconfirmed',
  });
});

test.each([false, true])(
  '服务端提前结束可交付合法空文字，残留partial=%s保持未确认',
  async (partial) => {
    const deps = dependencies();
    const mic = capture();
    openCapture.mockImplementation(mic.open);
    const view = await renderHook(() => useVoiceInput(deps));
    await act(async () => view.result.current.start());
    await act(async () => mic.started.resolve({ status: 'started' }));
    await act(() => {
      if (partial) deps.handlers.onPartial('未定稿');
      deps.handlers.onFinished();
    });
    expect(mic.handle.stop).toHaveBeenCalledTimes(1);
    await act(async () => mic.stopped.resolve({ status: 'stopped' }));
    expect(deps.onResult).toHaveBeenCalledWith({
      status: 'text',
      text: partial ? '未定稿' : '',
      completion: partial ? 'unconfirmed' : 'confirmed',
    });
  },
);

test('识别失败只保留final且关闭采用', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  await act(async () => mic.started.resolve({ status: 'started' }));
  await act(() => {
    deps.handlers.onFinal('已定稿');
    deps.handlers.onPartial('丢弃');
    deps.handlers.onError({ reason: 'transport', message: '识别连接失败' });
  });
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'failed',
    reason: 'recognition',
    finalText: '已定稿',
    message: '识别连接失败',
  });
  expect(view.result.current.state).toBe('error');
});

test.each(['user', 'context_ended'] as const)(
  'cancel(%s)丢弃文字，不finish，重复取消不重复交付',
  async (reason) => {
    const deps = dependencies();
    const mic = capture();
    openCapture.mockImplementation(mic.open);
    const view = await renderHook(() => useVoiceInput(deps));
    await act(async () => view.result.current.start());
    await act(() => {
      deps.handlers.onPartial('旧');
      view.result.current.cancel(reason);
      view.result.current.cancel();
      deps.handlers.onFinished();
    });
    expect(view.result.current.state).toBe('idle');
    expect(view.result.current.transcript).toBe('');
    expect(deps.session.finish).not.toHaveBeenCalled();
    expect(deps.session.close).toHaveBeenCalledTimes(1);
    expect(deps.onResult).toHaveBeenCalledTimes(reason === 'user' ? 1 : 0);
    if (reason === 'user')
      expect(deps.onResult).toHaveBeenCalledWith({
        status: 'cancelled',
        reason: 'user',
      });
    await act(async () => {
      mic.started.resolve({ status: 'cancelled' });
      mic.stopped.resolve({ status: 'stopped' });
    });
  },
);

test('早到PCM只转交原识别会话，stop后块不再采用，2秒内定稿仍可完成', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  const pcm = {
    data: new ArrayBuffer(2),
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16' as const,
  };
  await act(() => mic.handlers.onBuffer(pcm));
  expect(deps.session.sendAudio).toHaveBeenCalledTimes(1);
  expect(deps.session.sendAudio).toHaveBeenCalledWith(pcm);
  await act(async () => mic.started.resolve({ status: 'started' }));
  await act(() => {
    view.result.current.stop();
    mic.handlers.onBuffer(pcm);
  });
  expect(deps.session.sendAudio).toHaveBeenCalledTimes(1);
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(deps.onResult).not.toHaveBeenCalled();
  await act(() => {
    jest.advanceTimersByTime(1999);
    deps.handlers.onFinal('末句');
    deps.handlers.onFinished();
  });
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'text',
    text: '末句',
    completion: 'confirmed',
  });
  await act(() => jest.advanceTimersByTime(60000));
  expect(deps.session.finish).toHaveBeenCalledTimes(1);
  expect(deps.onResult).toHaveBeenCalledTimes(1);
});

test('采集尚未started即stop，识别完成或超时也不能越过原生停止，返回空unconfirmed', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  await act(() => {
    deps.handlers.onFinal('准备期');
    view.result.current.stop();
    deps.handlers.onFinished();
    jest.advanceTimersByTime(2000);
  });
  expect(deps.onResult).not.toHaveBeenCalled();
  await act(async () => mic.started.resolve({ status: 'cancelled' }));
  expect(deps.onResult).not.toHaveBeenCalled();
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'text',
    text: '',
    completion: 'unconfirmed',
  });
});

test('没有任何文字的收尾超时仍是unconfirmed，晚到final不能改变结果', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  await act(async () => mic.started.resolve({ status: 'started' }));
  await act(() => view.result.current.stop());
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  await act(() => jest.advanceTimersByTime(2000));
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'text',
    text: '',
    completion: 'unconfirmed',
  });
  await act(() => {
    deps.handlers.onFinal('迟到');
    deps.handlers.onFinished();
  });
  expect(deps.onResult).toHaveBeenCalledTimes(1);
  expect(view.result.current.transcript).toBe('');
});

test.each(['request', 'read'] as const)(
  '权限%s异常只产生permission失败，不开资源',
  async (phase) => {
    const deps = dependencies();
    deps.permissions[phase].mockImplementation(() => {
      throw new Error('raw');
    });
    const view = await renderHook(() => useVoiceInput(deps));
    await act(async () => view.result.current.start());
    expect(deps.onResult).toHaveBeenCalledWith({
      status: 'failed',
      reason: 'permission',
      finalText: '',
      message: '无法取得麦克风权限',
    });
    expect(deps.openRecognition).not.toHaveBeenCalled();
    expect(openCapture).not.toHaveBeenCalled();
  },
);

test('read等待中取消，迟到granted不创建资源', async () => {
  const deps = dependencies();
  const read = deferred<Awaited<ReturnType<typeof deps.permissions.read>>>();
  deps.permissions.read.mockReturnValue(read.promise);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  expect(deps.permissions.read).toHaveBeenCalledTimes(1);
  await act(() => view.result.current.cancel('context_ended'));
  await act(async () =>
    read.resolve([{ id: 'microphone', label: '麦克风', status: 'granted' }]),
  );
  expect(deps.onResult).not.toHaveBeenCalled();
  expect(openCapture).not.toHaveBeenCalled();
});

test.each(['throw', 'error', 'finished'] as const)(
  '识别opener同步%s时不打开采集，迟返回句柄仍归原轮关闭',
  async (mode) => {
    const deps = dependencies();
    deps.openRecognition.mockImplementation((handlers) => {
      if (mode === 'throw') throw new Error('raw');
      if (mode === 'error')
        handlers.onError({ reason: 'credential', message: '无法取得识别凭证' });
      if (mode === 'finished') handlers.onFinished();
      return deps.session;
    });
    const view = await renderHook(() => useVoiceInput(deps));
    await act(async () => view.result.current.start());
    expect(openCapture).not.toHaveBeenCalled();
    expect(deps.onResult).toHaveBeenCalledTimes(1);
    expect(deps.onResult.mock.calls[0][0].status).toBe(
      mode === 'finished' ? 'text' : 'failed',
    );
    if (mode !== 'throw') expect(deps.session.close).toHaveBeenCalledTimes(1);
  },
);

test.each(['sendAudio', 'finish'] as const)(
  '识别%s同步异常保留final并结束原采集',
  async (method) => {
    const deps = dependencies();
    const mic = capture();
    openCapture.mockImplementation(mic.open);
    const view = await renderHook(() => useVoiceInput(deps));
    await act(async () => view.result.current.start());
    await act(async () => mic.started.resolve({ status: 'started' }));
    await act(() => deps.handlers.onFinal('定稿'));
    deps.session[method].mockImplementation(() => {
      throw new Error('raw');
    });
    await act(() => {
      if (method === 'finish') view.result.current.stop();
      else
        mic.handlers.onBuffer({
          data: new ArrayBuffer(2),
          sampleRate: 16000,
          channels: 1,
          encoding: 'int16',
        });
    });
    await act(async () => mic.stopped.resolve({ status: 'stopped' }));
    expect(deps.onResult).toHaveBeenCalledWith({
      status: 'failed',
      reason: 'recognition',
      finalText: '定稿',
      message: '语音识别失败',
    });
    expect(mic.handle.stop).toHaveBeenCalledTimes(1);
  },
);

test('采集opener早到onError：迟返回句柄必须stop，失败结果等待真实停止', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation((input, handlers) => {
    handlers.onError({ reason: 'format', message: '音频格式不可用' });
    return mic.open(input, handlers);
  });
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  expect(mic.handle.stop).toHaveBeenCalledTimes(1);
  expect(deps.onResult).not.toHaveBeenCalled();
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'failed',
    reason: 'capture',
    finalText: '',
    message: '音频格式不可用',
  });
});

test('采集启动失败关闭识别并stop；异常close不妨碍下一次开始', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  deps.session.close.mockImplementation(() => {
    throw new Error('raw');
  });
  await act(async () =>
    mic.started.resolve({
      status: 'failed',
      error: { reason: 'unavailable', message: '麦克风启动失败' },
    }),
  );
  expect(mic.handle.stop).toHaveBeenCalledTimes(1);
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'failed',
    reason: 'capture',
    finalText: '',
    message: '麦克风启动失败',
  });
  await act(async () => view.result.current.start());
  expect(deps.openRecognition).toHaveBeenCalledTimes(2);
  await act(() => view.result.current.cancel());
});
