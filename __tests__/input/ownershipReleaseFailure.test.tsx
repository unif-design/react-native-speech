import { act, renderHook } from '@testing-library/react-native';
import { openAudioCapture } from '@unif/react-native-speech/capture';
import { useVoiceInput } from '@unif/react-native-speech/input';
import { dependencies, capture } from './fixture';
jest.mock('@unif/react-native-speech/capture', () => ({
  openAudioCapture: jest.fn(),
}));
const openCapture = jest.mocked(openAudioCapture);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// This file owns an unrecoverable capture failure; Jest isolates its module state.
test('真实停止失败覆盖已有文字，且禁止后续输入启动新的麦克风', async () => {
  const deps = dependencies(),
    next = dependencies();
  const mic = capture();
  openCapture.mockImplementation(mic.open);
  const view = await renderHook(() => useVoiceInput(deps)),
    other = await renderHook(() => useVoiceInput(next));
  await act(async () => view.result.current.start());
  expect(openCapture).toHaveBeenCalledTimes(1);
  await act(async () => mic.started.resolve({ status: 'started' }));
  await act(() => {
    deps.handlers.onFinal('保留');
    deps.handlers.onPartial('丢弃');
    view.result.current.stop();
    deps.handlers.onFinished();
  });
  await act(async () =>
    mic.stopped.resolve({
      status: 'failed',
      error: { reason: 'unavailable', message: '麦克风停止失败' },
    }),
  );
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'failed',
    finalText: '保留',
    reason: 'capture',
    message: '麦克风停止失败',
  });
  await act(async () => other.result.current.start());
  expect(next.onResult).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'failed', reason: 'capture' }),
  );
  expect(openCapture).toHaveBeenCalledTimes(1);
  expect(next.openRecognition).not.toHaveBeenCalled();
});
