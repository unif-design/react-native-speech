import {
  createLogger,
  createOperationContext,
  getFailureDiagnostics,
} from '@unif/react-native-logger';
import { SPEECH_CREDENTIAL_MESSAGES } from './constants';
import { readSpeechCredential } from './readSpeechCredential';
import type {
  SpeechCredential,
  SpeechCredentialAccess,
  SpeechCredentialRequest,
  SpeechCredentialResult,
} from './types';

export function createSpeechCredentialAccess(
  request: SpeechCredentialRequest,
): SpeechCredentialAccess {
  let cached: Readonly<SpeechCredential> | null = null;
  let requestSequence = 0;
  let completedSequence = 0;
  const lifetime = new AbortController();

  return {
    async get(options) {
      const signal = options?.signal;
      // 缓存交付也经过异步边界，使用入口 signal 与交付时的有效期。
      await Promise.resolve();
      if (signal?.aborted || lifetime.signal.aborted)
        return { status: 'cancelled' };
      cached = readSpeechCredential(cached);
      if (cached) return { status: 'success', credential: cached };

      const context = createOperationContext('system');
      const sequence = ++requestSequence;
      const controller = new AbortController();
      return new Promise<SpeechCredentialResult>((resolve) => {
        let settled = false;
        function finish(result: SpeechCredentialResult) {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', cancel);
          lifetime.signal.removeEventListener('abort', cancel);
          resolve(result);
        }
        function cancel() {
          finish({ status: 'cancelled' });
          controller.abort();
        }
        function complete(result: SpeechCredentialResult) {
          if (settled) return;
          if (signal?.aborted || lifetime.signal.aborted) {
            cancel();
            return;
          }
          if (sequence >= completedSequence) {
            completedSequence = sequence;
            if (result.status === 'success') cached = result.credential;
          }
          finish(result);
        }
        signal?.addEventListener('abort', cancel, { once: true });
        lifetime.signal.addEventListener('abort', cancel, { once: true });

        (async () => {
          try {
            const result = await request({ signal: controller.signal });
            if (settled) return;
            if (result.status !== 'success') {
              complete(result);
              return;
            }
            const credential = readSpeechCredential(result.credential);
            if (
              !credential &&
              !settled &&
              !signal?.aborted &&
              !lifetime.signal.aborted
            )
              createLogger('speech.credentials').warn('credential.invalid', {
                context,
                phase: 'validate',
                outcome: 'failed',
                code: 'speech.credentials.invalid_response',
                fields: {
                  operation: 'read_credential',
                  reason: 'invalid_response',
                },
              });
            complete(
              credential
                ? { status: 'success', credential }
                : {
                    status: 'failed',
                    reason: 'invalid_response',
                    message: SPEECH_CREDENTIAL_MESSAGES.invalid_response,
                  },
            );
          } catch (error) {
            if (!settled && !signal?.aborted && !lifetime.signal.aborted)
              createLogger('speech.credentials').warn(
                'credential.request_failed',
                {
                  context,
                  phase: 'credential',
                  outcome: 'failed',
                  code: 'speech.credentials.unavailable',
                  fields: {
                    operation: 'request',
                    ...getFailureDiagnostics(error),
                  },
                },
              );
            complete({
              status: 'failed',
              reason: 'unavailable',
              message: SPEECH_CREDENTIAL_MESSAGES.unavailable,
            });
          }
        })();
      });
    },
    invalidate(credential) {
      if (
        cached?.token === credential.token &&
        cached?.expiresAtSeconds === credential.expiresAtSeconds &&
        cached?.wsUrl === credential.wsUrl
      )
        cached = null;
    },
    dispose() {
      cached = null;
      lifetime.abort();
    },
  };
}
