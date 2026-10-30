import { act, renderHook } from '@testing-library/react-native';
import { openAudioCapture } from '@unif/react-native-speech/capture';
import { useVoiceInput } from '@unif/react-native-speech/input';
import { dependencies } from './fixture';
jest.mock('@unif/react-native-speech/capture', () => ({
  openAudioCapture: jest.fn(),
}));
const openCapture = jest.mocked(openAudioCapture);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// This file owns an unrecoverable capture failure; Jest isolates its module state.
test('同步采集opener异常不能留下starting或泄漏识别，资源未确认时禁止重开', async () => {
  const deps = dependencies();
  openCapture.mockImplementation(() => {
    throw new Error('native constructor');
  });
  const view = await renderHook(() => useVoiceInput(deps));
  await act(async () => view.result.current.start());
  expect(deps.onResult).toHaveBeenCalledWith({
    status: 'failed',
    reason: 'capture',
    finalText: '',
    message: '麦克风采集不可用',
  });
  expect(deps.session.close).toHaveBeenCalledTimes(1);
  expect(view.result.current.state).toBe('error');
  await act(async () => view.result.current.start());
  expect(openCapture).toHaveBeenCalledTimes(1);
  expect(deps.onResult).toHaveBeenCalledTimes(2);
});
