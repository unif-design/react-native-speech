import { AUDIO_CAPTURE_MESSAGES } from './constants';
import type {
  AudioCapture,
  AudioCaptureError,
  AudioCaptureStopResult,
} from './types';

export function createFailedCapture(
  reason: AudioCaptureError['reason'],
): AudioCapture {
  const stopped = Promise.resolve<AudioCaptureStopResult>({
    status: 'stopped',
  });
  return {
    started: Promise.resolve({
      status: 'failed',
      error: { reason, message: AUDIO_CAPTURE_MESSAGES[reason] },
    }),
    stop: () => stopped,
  };
}
