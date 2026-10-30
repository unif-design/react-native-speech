import type {
  AudioStreamBufferEvent,
  AudioStreamStatusEvent,
} from '../../src/capture/types';

export function deferredStart() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export class AudioStreamFixture {
  sampleRate = 48000;
  channels = 1;
  isStreaming = false;
  calls: string[] = [];
  buffers!: (buffer: AudioStreamBufferEvent) => void;
  statuses!: (status: AudioStreamStatusEvent) => void;
  removeBuffer = jest.fn(() => {
    this.calls.push('removeBuffer');
  });
  removeStatus = jest.fn(() => {
    this.calls.push('removeStatus');
  });
  start = jest.fn((): Promise<void> => {
    this.calls.push('start');
    return Promise.resolve();
  });
  stop = jest.fn(() => {
    this.calls.push('stop');
  });
  release = jest.fn(() => {
    this.calls.push('release');
  });
  addListener = jest.fn((event: string, listener: unknown) => {
    this.calls.push(event);
    if (event === 'audioStreamBuffer') {
      this.buffers = listener as typeof this.buffers;
      return { remove: this.removeBuffer };
    }
    this.statuses = listener as typeof this.statuses;
    return { remove: this.removeStatus };
  });

  buffer(overrides: Partial<AudioStreamBufferEvent> = {}) {
    this.buffers({
      data: new ArrayBuffer(8),
      sampleRate: this.sampleRate,
      channels: this.channels,
      encoding: 'int16',
      timestamp: 0.1,
      ...overrides,
    });
  }
}
