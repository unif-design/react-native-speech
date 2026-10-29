import { createFailedCapture } from './createFailedCapture';
import type {
  AudioCapture,
  AudioCaptureHandlers,
  AudioCaptureInput,
} from './types';

export function openAudioCapture(
  _input: Readonly<AudioCaptureInput>,
  _handlers: AudioCaptureHandlers,
): AudioCapture {
  return createFailedCapture('unsupported');
}
