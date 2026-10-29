import { AudioModule } from 'expo-audio';
import type { AudioStream, AudioStreamBuffer } from 'expo-audio';
import {
  AUDIO_CAPTURE_MESSAGES,
  AUDIO_STREAM_FORMAT_ERROR_CODE,
  PCM_BYTES_PER_SAMPLE,
} from './constants';
import { createFailedCapture } from './createFailedCapture';
import type {
  AudioCapture,
  AudioCaptureError,
  AudioCaptureHandlers,
  AudioCaptureInput,
  AudioCaptureStartResult,
  AudioCaptureStopResult,
} from './types';

function isFormatValid(format: Readonly<AudioCaptureInput>): boolean {
  return (
    Number.isSafeInteger(format.sampleRate) &&
    format.sampleRate > 0 &&
    (format.channels === 1 || format.channels === 2) &&
    (format.encoding === 'int16' || format.encoding === 'float32')
  );
}

function captureError(reason: 'format' | 'unavailable'): AudioCaptureError {
  return { reason, message: AUDIO_CAPTURE_MESSAGES[reason] };
}

function nativeError(error: unknown): AudioCaptureError {
  return captureError(
    typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === AUDIO_STREAM_FORMAT_ERROR_CODE
      ? 'format'
      : 'unavailable',
  );
}

export function openAudioCapture(
  input: Readonly<AudioCaptureInput>,
  handlers: AudioCaptureHandlers,
): AudioCapture {
  const options = {
    sampleRate: input?.sampleRate,
    channels: input?.channels,
    encoding: input?.encoding,
  };
  if (!isFormatValid(options)) return createFailedCapture('invalid_input');

  const { onBuffer, onError } = handlers;
  let stream: AudioStream | undefined;
  const subscriptions: ReturnType<AudioStream['addListener']>[] = [];
  let adopting = true;
  let acceptedStart = false;
  let failure: AudioCaptureError | undefined;
  let cleanupFailed = false;
  let stopping: Promise<AudioCaptureStopResult> | undefined;

  function stop(): Promise<AudioCaptureStopResult> {
    adopting = false;
    // Queue cleanup so even a synchronous SDK event can close adoption during start().
    stopping ??= Promise.resolve().then(async () => {
      await started;
      if (stream) {
        try {
          stream.stop();
        } catch {
          cleanupFailed = true;
        }
        for (const subscription of subscriptions) {
          try {
            subscription.remove();
          } catch {
            cleanupFailed = true;
          }
        }
        try {
          stream.release();
        } catch {
          cleanupFailed = true;
        }
      }
      return cleanupFailed
        ? {
            status: 'failed',
            error: {
              reason: 'unavailable',
              message: AUDIO_CAPTURE_MESSAGES.cleanup,
            },
          }
        : { status: 'stopped' };
    });
    return stopping;
  }

  function fail(error: AudioCaptureError): void {
    if (!adopting) return;
    failure = error;
    stop();
    if (acceptedStart) {
      try {
        onError(error);
      } catch {
        /* Consumer errors cannot prevent cleanup. */
      }
    }
  }

  function handleBuffer(buffer: AudioStreamBuffer): void {
    if (!adopting) return;
    if (
      !buffer ||
      !isFormatValid(buffer) ||
      !(buffer.data instanceof ArrayBuffer) ||
      buffer.data.byteLength %
        (PCM_BYTES_PER_SAMPLE[buffer.encoding] * buffer.channels) !==
        0 ||
      (acceptedStart &&
        (buffer.sampleRate !== stream!.sampleRate ||
          buffer.channels !== stream!.channels))
    ) {
      fail(captureError('format'));
      return;
    }
    try {
      onBuffer({
        data: buffer.data,
        sampleRate: buffer.sampleRate,
        channels: buffer.channels,
        encoding: buffer.encoding,
      });
    } catch {
      fail(captureError('unavailable'));
    }
  }

  async function start(): Promise<AudioCaptureStartResult> {
    try {
      stream = new AudioModule.AudioStream(options);
      subscriptions.push(stream.addListener('audioStreamBuffer', handleBuffer));
      subscriptions.push(
        stream.addListener('audioStreamStatus', (status) => {
          if (!adopting || !status.error) return;
          if (status.error === 'cleanup') cleanupFailed = true;
          fail(
            captureError(status.error === 'format' ? 'format' : 'unavailable'),
          );
        }),
      );
      await stream.start();
    } catch (error) {
      failure ??= nativeError(error);
      stop();
    }
    if (failure) return { status: 'failed', error: failure };
    if (!adopting) return { status: 'cancelled' };
    acceptedStart = true;
    return { status: 'started' };
  }

  const started = start();
  return { started, stop };
}
