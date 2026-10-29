import type {
  AudioCaptureStartResult,
  AudioCaptureStopResult,
  AudioCaptureHandlers,
} from '@unif/react-native-speech/capture';
import type { SpeechSessionHandlers } from '@unif/react-native-speech/realtime';
import type { VoiceInputPermissions } from '@unif/react-native-speech/input';
type PermissionEntry = Awaited<
  ReturnType<VoiceInputPermissions['read']>
>[number] & { label: string };

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function dependencies() {
  let handlers!: SpeechSessionHandlers;
  const session = { sendAudio: jest.fn(), finish: jest.fn(), close: jest.fn() };
  const permissions = {
    request: jest.fn(async () => {}),
    read: jest.fn(async (): Promise<PermissionEntry[]> => [
      { id: 'microphone', label: '麦克风', status: 'granted' },
    ]),
  };
  return {
    permissions,
    session,
    get handlers() {
      return handlers;
    },
    openRecognition: jest.fn((value: SpeechSessionHandlers) => {
      handlers = value;
      return session;
    }),
    onResult: jest.fn(),
  };
}
export function capture() {
  const started = deferred<AudioCaptureStartResult>();
  const stopped = deferred<AudioCaptureStopResult>();
  let handlers!: AudioCaptureHandlers;
  const handle = {
    started: started.promise,
    stop: jest.fn(() => stopped.promise),
  };
  return {
    started,
    stopped,
    handle,
    get handlers() {
      return handlers;
    },
    open: jest.fn((_input, value: AudioCaptureHandlers) => {
      handlers = value;
      return handle;
    }),
  };
}
