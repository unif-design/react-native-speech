const createUuid = jest.fn((): string => {
  throw new Error('Web must not call native UUID');
});
import {
  openSpeechSession,
  SPEECH_AUDIO_FORMAT,
} from '../../src/realtime/index.web';

test('Web returns unsupported without credential, native UUID or WebSocket work', async () => {
  const credentials = {
    get: jest.fn(),
    invalidate: jest.fn(),
    dispose: jest.fn(),
  };
  const handlers = {
    onStarted: jest.fn(),
    onPartial: jest.fn(),
    onFinal: jest.fn(),
    onFinished: jest.fn(),
    onError: jest.fn(),
  };
  const socket = jest.spyOn(global, 'WebSocket');
  const originalError = handlers.onError;
  const session = openSpeechSession({ credentials, createUuid }, handlers);
  handlers.onError = jest.fn();
  await Promise.resolve();
  session.sendAudio({ ...SPEECH_AUDIO_FORMAT, data: new ArrayBuffer(2) });
  session.finish();
  session.close();
  session.close();
  expect(originalError).toHaveBeenCalledWith({
    reason: 'unsupported',
    message: expect.any(String),
  });
  expect(originalError).toHaveBeenCalledTimes(1);
  expect(handlers.onError).not.toHaveBeenCalled();
  expect(credentials.get).not.toHaveBeenCalled();
  expect(socket).not.toHaveBeenCalled();
  expect(createUuid).not.toHaveBeenCalled();
  expect(handlers.onFinished).not.toHaveBeenCalled();
});

test('Web close silences pending terminal and throwing callback stays contained', async () => {
  const credentials = {
    get: jest.fn(),
    invalidate: jest.fn(),
    dispose: jest.fn(),
  };
  const handlers = {
    onStarted: jest.fn(),
    onPartial: jest.fn(),
    onFinal: jest.fn(),
    onFinished: jest.fn(),
    onError: jest.fn(() => {
      throw new Error('consumer');
    }),
  };
  const session = openSpeechSession({ credentials, createUuid }, handlers);
  session.close();
  await Promise.resolve();
  expect(handlers.onError).not.toHaveBeenCalled();
  openSpeechSession({ credentials, createUuid }, handlers);
  await Promise.resolve();
  expect(handlers.onError).toHaveBeenCalledTimes(1);
});
