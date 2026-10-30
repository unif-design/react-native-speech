import { StrictMode, useEffect } from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import { openAudioCapture } from '@unif/react-native-speech/capture';
import { useVoiceInput } from '@unif/react-native-speech/input';
import type { UseVoiceInputOptions } from '@unif/react-native-speech/input';
import { capture, dependencies } from './fixture';
jest.mock('@unif/react-native-speech/capture', () => ({
  openAudioCapture: jest.fn(),
}));
const openCapture = jest.mocked(openAudioCapture);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('A慢启动→B→C：B没有采集也不能清掉A的实际释放等待', async () => {
  const a = dependencies(),
    b = dependencies(),
    c = dependencies();
  const micA = capture(),
    micC = capture();
  openCapture
    .mockImplementationOnce(micA.open)
    .mockImplementationOnce(micC.open);
  const av = await renderHook(() => useVoiceInput(a)),
    bv = await renderHook(() => useVoiceInput(b)),
    cv = await renderHook(() => useVoiceInput(c));
  await act(async () => av.result.current.start());
  expect(openCapture).toHaveBeenCalledTimes(1);
  await act(async () => bv.result.current.start());
  await act(async () => cv.result.current.start());
  expect(a.onResult).toHaveBeenCalledWith({
    status: 'cancelled',
    reason: 'replaced',
  });
  expect(b.onResult).toHaveBeenCalledWith({
    status: 'cancelled',
    reason: 'replaced',
  });
  expect(openCapture).toHaveBeenCalledTimes(1);
  expect(c.openRecognition).not.toHaveBeenCalled();
  await act(async () => micA.started.resolve({ status: 'cancelled' }));
  expect(openCapture).toHaveBeenCalledTimes(1);
  await act(async () => micA.stopped.resolve({ status: 'stopped' }));
  expect(openCapture).toHaveBeenCalledTimes(2);
  expect(b.openRecognition).not.toHaveBeenCalled();
  await act(() => {
    a.handlers.onFinal('旧');
    a.handlers.onFinished();
  });
  expect(cv.result.current.transcript).toBe('');
  expect(micC.handle.stop).not.toHaveBeenCalled();
  await act(() => cv.result.current.cancel());
  await act(async () => micC.stopped.resolve({ status: 'stopped' }));
});

test('A被替换回调同步开始C，B不能再发权限或创建任何资源', async () => {
  const a = dependencies(),
    b = dependencies(),
    c = dependencies();
  const micA = capture(),
    micC = capture();
  openCapture
    .mockImplementationOnce(micA.open)
    .mockImplementationOnce(micC.open);
  const av = await renderHook(() => useVoiceInput(a)),
    bv = await renderHook(() => useVoiceInput(b)),
    cv = await renderHook(() => useVoiceInput(c));
  a.onResult.mockImplementation(() => cv.result.current.start());
  await act(async () => av.result.current.start());
  expect(openCapture).toHaveBeenCalledTimes(1);
  await act(async () => bv.result.current.start());
  expect(b.permissions.request).not.toHaveBeenCalled();
  expect(b.openRecognition).not.toHaveBeenCalled();
  expect(bv.result.current.state).toBe('idle');
  await act(async () => micA.stopped.resolve({ status: 'stopped' }));
  expect(c.openRecognition).toHaveBeenCalledTimes(1);
  expect(openCapture).toHaveBeenCalledTimes(2);
  await act(() => cv.result.current.cancel());
  await act(async () => micC.stopped.resolve({ status: 'stopped' }));
});

test('普通rerender保留原接收者和依赖，下一轮使用新options，回调抛错仍收尾', async () => {
  const first = dependencies(),
    next = dependencies();
  const mic = capture(),
    nextMic = capture();
  openCapture
    .mockImplementationOnce(mic.open)
    .mockImplementationOnce(nextMic.open);
  const view = await renderHook(
    (options: UseVoiceInputOptions) => useVoiceInput(options),
    {
      initialProps: first,
    },
  );
  await act(async () => view.result.current.start());
  expect(first.openRecognition).toHaveBeenCalledTimes(1);
  await act(async () => mic.started.resolve({ status: 'started' }));
  await view.rerender(next);
  first.onResult.mockImplementation(() => {
    throw new Error('consumer');
  });
  await act(() => {
    first.handlers.onFinal('原轮');
    first.handlers.onFinished();
  });
  await act(async () => mic.stopped.resolve({ status: 'stopped' }));
  expect(first.onResult).toHaveBeenCalledWith({
    status: 'text',
    text: '原轮',
    completion: 'confirmed',
  });
  expect(next.onResult).not.toHaveBeenCalled();
  await act(async () => view.result.current.start());
  expect(next.openRecognition).toHaveBeenCalledTimes(1);
  await act(() => view.result.current.cancel());
  await act(async () => nextMic.stopped.resolve({ status: 'stopped' }));
});

test('StrictMode effect重放后仍可开始；真正卸载静默取消且旧start不能重开', async () => {
  const deps = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const mounted = jest.fn();
  const unmounted = jest.fn();
  let input!: ReturnType<typeof useVoiceInput>;
  function InputProbe() {
    useEffect(() => {
      mounted();
      return unmounted;
    }, []);
    input = useVoiceInput(deps);
    return null;
  }
  const view = await render(
    <StrictMode>
      <InputProbe />
    </StrictMode>,
  );
  expect(mounted).toHaveBeenCalledTimes(2);
  expect(unmounted).toHaveBeenCalledTimes(1);
  const oldStart = input.start;
  await act(async () => oldStart());
  expect(openCapture).toHaveBeenCalledTimes(1);
  await view.unmount();
  await act(async () => oldStart());
  expect(deps.onResult).not.toHaveBeenCalled();
  expect(deps.session.close).toHaveBeenCalledTimes(1);
  expect(openCapture).toHaveBeenCalledTimes(1);
  await act(async () => {
    mic.started.resolve({ status: 'cancelled' });
    mic.stopped.resolve({ status: 'stopped' });
  });
});

test('用户取消先结束原轮采用，stop同步重入新输入不能改成replaced', async () => {
  const a = dependencies(),
    b = dependencies();
  const micA = capture(),
    micB = capture();
  openCapture
    .mockImplementationOnce(micA.open)
    .mockImplementationOnce(micB.open);
  const av = await renderHook(() => useVoiceInput(a)),
    bv = await renderHook(() => useVoiceInput(b));
  await act(async () => av.result.current.start());
  micA.handle.stop.mockImplementation(() => {
    bv.result.current.start();
    return micA.stopped.promise;
  });
  await act(() => av.result.current.cancel());
  expect(a.onResult).toHaveBeenCalledWith({
    status: 'cancelled',
    reason: 'user',
  });
  expect(a.onResult).toHaveBeenCalledTimes(1);
  await act(async () => {
    micA.started.resolve({ status: 'cancelled' });
    micA.stopped.resolve({ status: 'stopped' });
  });
  expect(b.openRecognition).toHaveBeenCalledTimes(1);
  await act(() => bv.result.current.cancel());
  await act(async () => {
    micB.started.resolve({ status: 'cancelled' });
    micB.stopped.resolve({ status: 'stopped' });
  });
});

test('采集opener内同步接管，迟返回句柄仍阻止新输入提前开麦克风', async () => {
  const a = dependencies(),
    b = dependencies();
  const micA = capture(),
    micB = capture();
  const av = await renderHook(() => useVoiceInput(a)),
    bv = await renderHook(() => useVoiceInput(b));
  openCapture
    .mockImplementationOnce((input, handlers) => {
      bv.result.current.start();
      return micA.open(input, handlers);
    })
    .mockImplementationOnce(micB.open);
  await act(async () => av.result.current.start());
  expect(a.onResult).toHaveBeenCalledWith({
    status: 'cancelled',
    reason: 'replaced',
  });
  expect(micA.handle.stop).toHaveBeenCalledTimes(1);
  expect(openCapture).toHaveBeenCalledTimes(1);
  expect(b.openRecognition).not.toHaveBeenCalled();
  await act(async () => {
    micA.started.resolve({ status: 'cancelled' });
    micA.stopped.resolve({ status: 'stopped' });
  });
  expect(openCapture).toHaveBeenCalledTimes(2);
  await act(() => bv.result.current.cancel());
  await act(async () => {
    micB.started.resolve({ status: 'cancelled' });
    micB.stopped.resolve({ status: 'stopped' });
  });
});

test('原轮finishing已有定稿但采集未释放时接管，只交付replaced而不回填旧文字', async () => {
  const a = dependencies(),
    b = dependencies();
  const micA = capture(),
    micB = capture();
  openCapture
    .mockImplementationOnce(micA.open)
    .mockImplementationOnce(micB.open);
  const av = await renderHook(() => useVoiceInput(a)),
    bv = await renderHook(() => useVoiceInput(b));
  await act(async () => av.result.current.start());
  await act(async () => micA.started.resolve({ status: 'started' }));
  await act(() => {
    a.handlers.onFinal('旧文字');
    av.result.current.stop();
    a.handlers.onFinished();
  });
  expect(a.onResult).not.toHaveBeenCalled();
  await act(async () => bv.result.current.start());
  expect(a.onResult).toHaveBeenCalledWith({
    status: 'cancelled',
    reason: 'replaced',
  });
  await act(async () => micA.stopped.resolve({ status: 'stopped' }));
  expect(a.onResult).toHaveBeenCalledTimes(1);
  expect(bv.result.current.state).toBe('starting');
  await act(() => bv.result.current.cancel());
  await act(async () => {
    micB.started.resolve({ status: 'cancelled' });
    micB.stopped.resolve({ status: 'stopped' });
  });
});
