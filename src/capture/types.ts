import type {
  AudioStreamBuffer as SdkAudioStreamBuffer,
  AudioStreamEncoding as SdkAudioStreamEncoding,
  AudioStreamOptions as SdkAudioStreamOptions,
} from 'expo-audio';

export interface AudioCaptureInput extends Required<
  Pick<SdkAudioStreamOptions, 'sampleRate' | 'channels' | 'encoding'>
> {}

export interface PcmAudioBuffer extends Pick<
  SdkAudioStreamBuffer,
  'data' | 'sampleRate' | 'channels'
> {
  encoding: SdkAudioStreamEncoding;
}

export interface AudioCaptureError {
  reason: 'invalid_input' | 'unsupported' | 'format' | 'unavailable';
  message: string;
}

export interface AudioCaptureHandlers {
  onBuffer(buffer: Readonly<PcmAudioBuffer>): void;
  onError(error: Readonly<AudioCaptureError>): void;
}

export interface AudioCaptureStarted {
  status: 'started';
}
export interface AudioCaptureCancelled {
  status: 'cancelled';
}
export interface AudioCaptureFailed {
  status: 'failed';
  error: AudioCaptureError;
}
export type AudioCaptureStartResult =
  AudioCaptureStarted | AudioCaptureCancelled | AudioCaptureFailed;
export interface AudioCaptureStopped {
  status: 'stopped';
}
export type AudioCaptureStopResult = AudioCaptureStopped | AudioCaptureFailed;
export interface AudioCapture {
  started: Promise<AudioCaptureStartResult>;
  stop(): Promise<AudioCaptureStopResult>;
}
