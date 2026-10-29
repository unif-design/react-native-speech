jest.mock('expo-audio', () => {
  throw new Error('Web must not load native audio');
});

import { openAudioCapture } from '../../src/capture/index.web';

test('Web 返回 unsupported 且不装载原生 SDK，重复 stop 是无资源成功', async () => {
  const callbacks = { onBuffer: jest.fn(), onError: jest.fn() };
  const capture = openAudioCapture(
    { sampleRate: 16000, channels: 1, encoding: 'int16' },
    callbacks,
  );
  await expect(capture.started).resolves.toMatchObject({
    status: 'failed',
    error: { reason: 'unsupported' },
  });
  const stopped = capture.stop();
  expect(capture.stop()).toBe(stopped);
  await expect(stopped).resolves.toEqual({ status: 'stopped' });
  expect(callbacks.onBuffer).not.toHaveBeenCalled();
  expect(callbacks.onError).not.toHaveBeenCalled();
});
