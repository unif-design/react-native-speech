import type {
  AudioStreamBuffer as SdkAudioStreamBuffer,
  AudioStreamEncoding as SdkAudioStreamEncoding,
  AudioStreamOptions as SdkAudioStreamOptions,
  AudioStreamStatus as SdkAudioStreamStatus,
} from 'expo-audio';

// Host-added event fields are untrusted until the capture boundary validates them.
export type AudioStreamBufferEvent = Pick<
  SdkAudioStreamBuffer,
  'data' | 'sampleRate' | 'channels' | 'timestamp'
> & { encoding?: unknown };

export type AudioStreamStatusEvent = Pick<
  SdkAudioStreamStatus,
  'isStreaming'
> & { error?: unknown };

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
