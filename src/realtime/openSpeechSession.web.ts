import { SPEECH_SESSION_MESSAGES } from './constants';
import type {
  OpenSpeechSessionInput,
  SpeechSession,
  SpeechSessionHandlers,
} from './types';

export function openSpeechSession(
  _input: Readonly<OpenSpeechSessionInput>,
  handlers: SpeechSessionHandlers,
): SpeechSession {
  const { onError } = handlers;
  let active = true;
  Promise.resolve().then(() => {
    if (!active) return;
    active = false;
    try {
      onError({
        reason: 'unsupported',
        message: SPEECH_SESSION_MESSAGES.unsupported,
      });
    } catch {
      // 终态回调抛错不能产生第二次通知。
    }
  });
  return {
    sendAudio() {},
    finish() {},
    close() {
      active = false;
    },
  };
}
