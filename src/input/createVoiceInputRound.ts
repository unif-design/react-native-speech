import { openAudioCapture } from '@unif/react-native-speech/capture';
import type { AudioCapture, AudioCaptureStopResult } from '../capture';
import { SPEECH_AUDIO_FORMAT } from '@unif/react-native-speech/realtime';
import type { SpeechSession } from '../realtime';
import {
  VOICE_INPUT_DURATION_MS,
  VOICE_INPUT_FINISH_MS,
  VOICE_INPUT_MESSAGES,
} from './constants';
import {
  claimVoiceInput,
  releaseVoiceInput,
  retainCaptureRelease,
} from './ownership';
import type {
  UseVoiceInputOptions,
  VoiceInputFailed,
  VoiceInputResult,
  VoiceInputRound,
  VoiceInputRoundHandlers,
} from './types';

export function createVoiceInputRound(
  options: UseVoiceInputOptions,
  handlers: VoiceInputRoundHandlers,
): VoiceInputRound {
  const { permissions, openRecognition, onResult } = options;
  let active = true;
  let stopping = false;
  let started = false;
  let recognitionDone = false;
  let confirmed = false;
  let finalText = '';
  let partial = '';
  let failure: VoiceInputFailed | undefined;
  let session: SpeechSession | undefined;
  let capture: AudioCapture | undefined;
  let creatingCapture = false;
  let closeRequested = false;
  let stopRequested = false;
  let captureResult: AudioCaptureStopResult | undefined;
  let resolveRelease: ((value: AudioCaptureStopResult) => void) | undefined;
  let durationTimer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;

  function closeRecognition(): void {
    closeRequested = true;
    const owned = session;
    session = undefined;
    try {
      owned?.close();
    } catch {
      /* 关闭异常不能中断采集收尾。 */
    }
  }
  function clearTimers(): void {
    clearTimeout(durationTimer);
    clearTimeout(finishTimer);
  }
  function deliver(result?: VoiceInputResult): void {
    if (!active) return;
    active = false;
    clearTimers();
    releaseVoiceInput(round);
    handlers.update({
      state: result?.status === 'failed' ? 'error' : 'idle',
      transcript: '',
    });
    handlers.end();
    stopCapture();
    closeRecognition();
    try {
      if (result) onResult(result);
    } catch {
      /* 原接收方异常不生成第二次结果。 */
    }
  }
  function complete(): void {
    if (!active || !stopping || !recognitionDone || creatingCapture) return;
    if (resolveRelease && !captureResult) return;
    if (captureResult?.status === 'failed') {
      deliver({
        status: 'failed',
        reason: 'capture',
        finalText,
        message: captureResult.error.message,
      });
    } else if (failure) {
      deliver({ ...failure, finalText });
    } else {
      deliver({
        status: 'text',
        text: started ? finalText + partial : '',
        completion:
          started && confirmed && !partial ? 'confirmed' : 'unconfirmed',
      });
    }
  }
  function captureSettled(result: AudioCaptureStopResult): void {
    captureResult = result;
    resolveRelease?.(result);
    complete();
  }
  function stopCapture(): void {
    if (stopRequested || creatingCapture) return;
    stopRequested = true;
    if (!capture) return;
    try {
      capture.stop().then(captureSettled, () =>
        captureSettled({
          status: 'failed',
          error: {
            reason: 'unavailable',
            message: VOICE_INPUT_MESSAGES.capture,
          },
        }),
      );
    } catch {
      captureSettled({
        status: 'failed',
        error: { reason: 'unavailable', message: VOICE_INPUT_MESSAGES.capture },
      });
    }
  }
  function fail(
    reason: VoiceInputFailed['reason'],
    message: string = VOICE_INPUT_MESSAGES[reason],
  ): void {
    if (!active || failure) return;
    failure = { status: 'failed', reason, finalText, message };
    recognitionDone = true;
    beginStop();
    closeRecognition();
    complete();
  }
  function beginStop(): void {
    if (!active || stopping) return;
    stopping = true;
    clearTimeout(durationTimer);
    handlers.update({ state: 'finishing', transcript: finalText + partial });
    stopCapture();
  }
  function stop(): void {
    if (!active || stopping) return;
    beginStop();
    if (!capture && !creatingCapture) {
      recognitionDone = true;
      closeRecognition();
    } else if (!recognitionDone) {
      finishTimer = setTimeout(() => {
        if (!active || recognitionDone) return;
        recognitionDone = true;
        closeRecognition();
        complete();
      }, VOICE_INPUT_FINISH_MS);
      try {
        session?.finish();
      } catch {
        fail('recognition');
      }
    }
    complete();
  }
  function cancel(reason: 'user' | 'replaced' | 'context_ended'): void {
    if (!active) return;
    stopping = true;
    deliver(
      reason === 'context_ended' ? undefined : { status: 'cancelled', reason },
    );
  }
  function updateText(): void {
    handlers.update({
      state: stopping ? 'finishing' : started ? 'listening' : 'starting',
      transcript: finalText + partial,
    });
  }
  async function prepare(
    release: Promise<AudioCaptureStopResult>,
  ): Promise<void> {
    try {
      const previous = await release;
      if (!active || stopping) return;
      if (previous.status === 'failed') {
        fail('capture', previous.error.message);
        return;
      }
      await permissions.request('microphone');
      if (!active || stopping) return;
      const entries = await permissions.read(['microphone']);
      if (!active || stopping) return;
      if (
        !entries.some(
          (entry) => entry.id === 'microphone' && entry.status === 'granted',
        )
      ) {
        fail('permission');
        return;
      }
    } catch {
      fail('permission');
      return;
    }
    durationTimer = setTimeout(stop, VOICE_INPUT_DURATION_MS);
    try {
      session = openRecognition({
        onStarted() {},
        onPartial(text) {
          if (active && !recognitionDone) {
            partial = text;
            updateText();
          }
        },
        onFinal(text) {
          if (active && !recognitionDone) {
            finalText += text;
            partial = '';
            updateText();
          }
        },
        onFinished() {
          if (!active || recognitionDone) return;
          recognitionDone = true;
          confirmed = true;
          clearTimeout(finishTimer);
          beginStop();
          complete();
        },
        onError(error) {
          if (!recognitionDone) fail('recognition', error.message);
        },
      });
    } catch {
      fail('recognition');
    }
    if (!active || stopping || closeRequested) {
      closeRecognition();
      return;
    }
    creatingCapture = true;
    retainCaptureRelease(
      new Promise((resolve) => {
        resolveRelease = resolve;
      }),
    );
    try {
      capture = openAudioCapture(SPEECH_AUDIO_FORMAT, {
        onBuffer(buffer) {
          if (!active || stopping) return;
          try {
            session?.sendAudio(buffer);
          } catch {
            fail('recognition');
          }
        },
        onError(error) {
          fail('capture', error.message);
        },
      });
      capture.started.then(
        (result) => {
          if (!active || stopping) return;
          if (result.status === 'started') {
            started = true;
            updateText();
          } else if (result.status === 'failed')
            fail('capture', result.error.message);
          else stop();
        },
        () => fail('capture'),
      );
    } catch {
      captureSettled({
        status: 'failed',
        error: { reason: 'unavailable', message: VOICE_INPUT_MESSAGES.capture },
      });
      fail('capture');
    } finally {
      creatingCapture = false;
      if (!active || stopping) {
        stopCapture();
        complete();
      }
    }
  }
  const round: VoiceInputRound = {
    begin() {
      const release = claimVoiceInput(round);
      if (!active) return;
      handlers.update({ state: 'starting', transcript: '' });
      prepare(release);
    },
    stop,
    cancel,
  };
  return round;
}
