import { installLogging } from '@unif/react-native-logger';
import type {
  LoggingHandle,
  LogFileStore,
  LogWrite,
} from '@unif/react-native-logger';

export async function loggerRuntimeFixture(): Promise<{
  handle: LoggingHandle;
  writes: LogWrite[];
}> {
  const writes: LogWrite[] = [];
  const files: LogFileStore = {
    append: (entry) => {
      writes.push(entry);
    },
    setOwner: async () => {},
    flush: async () => {},
    getStatus: () => ({
      storageMode: 'memory',
      state: 'ready',
      writable: true,
      bufferedBytes: 0,
      droppedCount: 0,
      corruptedLines: 0,
      lastFailureCode: null,
    }),
    createSnapshot: jest.fn(),
    readSnapshot: jest.fn(),
    releaseSnapshot: jest.fn(),
    takeSnapshotFile: jest.fn(),
    readSummary: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
  };
  let sequence = 0;
  const handle = installLogging({
    files,
    createId: () => `test-${++sequence}`,
    policy: {
      service: 'sdk-test',
      startupScopes: [],
      allowedFields: [
        'operation',
        'reason',
        'sourceCode',
        'errorType',
        'causeType',
        'causeCode',
        'status',
      ],
    },
    environment: {
      appVersion: '1',
      platform: 'test',
      osVersion: '1',
      development: false,
    },
  });
  await handle.setOwner('owner');
  return { handle, writes };
}
