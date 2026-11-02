import {
  SPEECH_CREDENTIAL_FORBIDDEN_MESSAGE,
  SPEECH_CREDENTIAL_MESSAGES,
} from './constants';
import type { SpeechCredentialFailed } from './types';

export function describeSpeechCredentialFailure(
  failure: Pick<SpeechCredentialFailed, 'reason' | 'httpStatus'>,
): string {
  return failure.reason === 'access' && failure.httpStatus === 403
    ? SPEECH_CREDENTIAL_FORBIDDEN_MESSAGE
    : SPEECH_CREDENTIAL_MESSAGES[failure.reason];
}
