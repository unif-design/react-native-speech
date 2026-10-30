import type {
  AudioModule,
  AudioStreamBuffer,
  AudioStreamEncoding,
  AudioStreamEvents,
  AudioStreamStatus,
} from 'expo-audio';

// The prepared host checks its patched SDK declarations without executing native code.
export type PublicNativeStream = InstanceType<typeof AudioModule.AudioStream>;
export type PublicActualEncoding = AudioStreamBuffer['encoding'];
export type PublicTerminalError = NonNullable<AudioStreamStatus['error']>;
export type PublicEventBuffer = Parameters<
  AudioStreamEvents['audioStreamBuffer']
>[0];
export const encoding: PublicActualEncoding =
  'int16' satisfies AudioStreamEncoding;
export const error: PublicTerminalError = 'interrupted';
// @ts-expect-error The native format field cannot be omitted from a valid PCM event.
export const missingActualEncoding: AudioStreamBuffer = {
  data: new ArrayBuffer(4),
  sampleRate: 16000,
  channels: 1,
  timestamp: 0,
};
