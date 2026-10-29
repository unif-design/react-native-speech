import { useVoiceInput, SPEECH_AUDIO_FORMAT } from '@unif/react-native-speech';
import {
  createSpeechCredentialAccess,
  readSpeechCredential,
  SPEECH_CREDENTIAL_MESSAGES,
} from '@unif/react-native-speech/credentials';
import type { SpeechCredentialRequest } from '@unif/react-native-speech/credentials';
import { openSpeechSession } from '@unif/react-native-speech/realtime';
import type {
  SpeechSessionOpener,
  SpeechSessionHandlers,
} from '@unif/react-native-speech/realtime';
import { openAudioCapture } from '@unif/react-native-speech/capture';
import type {
  AudioCapture,
  AudioCaptureHandlers,
  PcmAudioBuffer,
} from '@unif/react-native-speech/capture';
import type {
  VoiceInputPermissions,
  UseVoiceInputOptions,
} from '@unif/react-native-speech/input';

declare const request: SpeechCredentialRequest;
declare const createUuid: () => string;
declare const permissions: VoiceInputPermissions;
declare const speechHandlers: SpeechSessionHandlers;
declare const captureHandlers: AudioCaptureHandlers;
const credentials = createSpeechCredentialAccess(request);
const openRecognition: SpeechSessionOpener = (handlers) =>
  openSpeechSession({ credentials, createUuid }, handlers);
const options: UseVoiceInputOptions = {
  permissions,
  openRecognition,
  onResult() {},
};
// @ts-expect-error 公开入口仍要求宿主提供原 UUID 函数。
openSpeechSession({ credentials }, speechHandlers);
openAudioCapture(
  // @ts-expect-error PCM 采样率必须是数字，不能因声明缺失退化为 any。
  { sampleRate: '16000', channels: 1, encoding: 'int16' },
  captureHandlers,
);
const capture: AudioCapture = openAudioCapture(SPEECH_AUDIO_FORMAT, {
  onBuffer(buffer: Readonly<PcmAudioBuffer>) {
    buffer.data.slice(0);
  },
  onError(error) {
    return void error.reason;
  },
});
export {
  capture,
  options,
  useVoiceInput,
  readSpeechCredential,
  SPEECH_CREDENTIAL_MESSAGES,
};
