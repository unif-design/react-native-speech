import { URL } from 'react-native-url-polyfill';
import {
  createLogger,
  createOperationContext,
  getFailureDiagnostics,
} from '@unif/react-native-logger';
import type { PcmAudioBuffer } from '../capture';
import type { SpeechCredential } from '../credentials';
import { SPEECH_AUDIO_FORMAT, SPEECH_SESSION_MESSAGES } from './constants';
import {
  createSpeechFinishCommand,
  createSpeechStartCommand,
  readSpeechEvent,
} from './speechProtocol';
import type {
  OpenSpeechSessionInput,
  SpeechSession,
  SpeechSessionError,
  SpeechSessionHandlers,
} from './types';

export function openSpeechSession(
  input: Readonly<OpenSpeechSessionInput>,
  handlers: SpeechSessionHandlers,
): SpeechSession {
  const log = createLogger('speech.session');
  const context = createOperationContext('system');
  const credentials = input.credentials;
  const { onStarted, onPartial, onFinal, onFinished, onError } = handlers;
  const controller = new AbortController();
  const vocabularyController = new AbortController();
  const pending: ArrayBuffer[] = [];
  const finalSentences = new Set<number>();
  let active = true;
  let accepting = true;
  let opened = false;
  let started = false;
  let draining = false;
  let finishSent = false;
  let socket: WebSocket | undefined;
  let credential: Readonly<SpeechCredential> | undefined;
  let taskId = '';
  let vocabulary: readonly string[] = [];

  function recordFailure(
    operation: string,
    phase: string,
    fields: Partial<ReturnType<typeof getFailureDiagnostics>>,
  ): void {
    log.warn('speech.session.failed', {
      context,
      phase,
      outcome: 'failed',
      code: 'speech.session.failed',
      fields: {
        operation,
        status: !active
          ? 'closed'
          : started
            ? 'started'
            : opened
              ? 'opened'
              : 'preparing',
        ...fields,
      },
    });
  }

  function safely(
    action: () => void,
    operation: string,
    phase = 'cleanup',
  ): void {
    try {
      action();
    } catch (error) {
      recordFailure(operation, phase, getFailureDiagnostics(error));
      // 清理和终态回调异常不能中断其余资源释放或生成第二次结果。
    }
  }

  function cleanup(): void {
    pending.length = 0;
    vocabulary = [];
    finalSentences.clear();
    safely(() => controller.abort(), 'abort_credential');
    safely(() => vocabularyController.abort(), 'abort_vocabulary');
    const owned = socket;
    socket = undefined;
    if (!owned) return;
    safely(
      () => owned.removeEventListener('open', handleOpen),
      'remove_open_listener',
    );
    safely(
      () => owned.removeEventListener('message', handleMessage),
      'remove_message_listener',
    );
    safely(
      () => owned.removeEventListener('error', handleTransportError),
      'remove_error_listener',
    );
    safely(
      () => owned.removeEventListener('close', handleTransportClose),
      'remove_close_listener',
    );
    safely(() => owned.close(), 'close_socket');
  }

  function close(): void {
    if (!active) return;
    active = false;
    accepting = false;
    cleanup();
  }

  function end(error?: Readonly<SpeechSessionError>): void {
    if (!active) return;
    close();
    if (
      credential &&
      (error?.sourceCode === 'InvalidApiKey' ||
        error?.sourceCode === 'invalid_api_key')
    ) {
      const usedCredential = credential;
      safely(
        () => credentials.invalidate(usedCredential),
        'invalidate_credential',
      );
    }
    safely(
      () => (error ? onError(error) : onFinished()),
      error ? 'on_error' : 'on_finished',
      'callback',
    );
  }

  function fail(reason: SpeechSessionError['reason']): void {
    end({ reason, message: SPEECH_SESSION_MESSAGES[reason] });
  }

  function notify(callback: () => void, operation: string): void {
    try {
      callback();
    } catch (error) {
      recordFailure(operation, 'callback', getFailureDiagnostics(error));
      close();
    }
  }

  function drain(): void {
    if (!active || !started || draining || !socket) return;
    draining = true;
    let operation = 'send_audio';
    try {
      while (active && pending.length > 0) {
        socket.send(pending.shift()!);
      }
      if (active && !accepting && !finishSent) {
        finishSent = true;
        operation = 'send_finish';
        socket.send(createSpeechFinishCommand(taskId));
      }
    } catch (error) {
      if (active)
        recordFailure(operation, 'send', getFailureDiagnostics(error));
      fail('transport');
    } finally {
      draining = false;
    }
  }

  function sendAudio(buffer: Readonly<PcmAudioBuffer>): void {
    if (!active || !accepting) return;
    try {
      if (
        buffer.sampleRate !== SPEECH_AUDIO_FORMAT.sampleRate ||
        buffer.channels !== SPEECH_AUDIO_FORMAT.channels ||
        buffer.encoding !== SPEECH_AUDIO_FORMAT.encoding ||
        !(buffer.data instanceof ArrayBuffer) ||
        buffer.data.byteLength % 2 !== 0
      ) {
        fail('audio_format');
        return;
      }
      if (buffer.data.byteLength === 0) return;
      // 准备期及同步重入只采用一次字节快照，始终进入同一待发送集合。
      pending.push(
        started && !draining && pending.length === 0
          ? buffer.data
          : buffer.data.slice(0),
      );
    } catch (error) {
      if (active)
        recordFailure('read_audio', 'prepare', getFailureDiagnostics(error));
      fail('audio_format');
      return;
    }
    drain();
  }

  function finish(): void {
    if (!active || !accepting) return;
    accepting = false;
    vocabularyController.abort();
    drain();
  }

  function handleOpen(): void {
    if (!active || opened || !socket) return;
    opened = true;
    try {
      socket.send(createSpeechStartCommand(taskId, vocabulary));
    } catch (error) {
      if (active)
        recordFailure('send_start', 'send', getFailureDiagnostics(error));
      fail('transport');
    }
  }

  function handleTransportError(event: WebSocketErrorEvent): void {
    if (active)
      recordFailure('socket_error', 'transport', getFailureDiagnostics(event));
    fail('transport');
  }

  function handleTransportClose(event: WebSocketCloseEvent): void {
    if (!active) return;
    let sourceCode: number | undefined;
    try {
      const code = event.code;
      if (
        typeof code === 'number' &&
        Number.isInteger(code) &&
        code >= 1000 &&
        code <= 4999
      )
        sourceCode = code;
    } catch {
      // 原生事件的诊断字段读取失败不能阻止已有终态收尾。
    }
    recordFailure('socket_close', 'transport', {
      reason: 'socket_closed',
      ...(sourceCode === undefined ? {} : { sourceCode }),
    });
    fail('transport');
  }

  function handleMessage(message: WebSocketMessageEvent): void {
    if (!active) return;
    const event = readSpeechEvent(message.data, taskId);
    switch (event.type) {
      case 'started':
        if (started) return;
        started = true;
        // 回调可重入；原队列的优先级必须保持到回调交接之后。
        draining = true;
        notify(onStarted, 'on_started');
        draining = false;
        drain();
        return;
      case 'partial':
        notify(() => onPartial(event.text), 'on_partial');
        return;
      case 'final':
        if (event.sentenceId !== undefined) {
          if (finalSentences.has(event.sentenceId)) return;
          finalSentences.add(event.sentenceId);
        }
        notify(() => onFinal(event.text), 'on_final');
        return;
      case 'finished':
        end();
        return;
      case 'failed':
        recordFailure('provider_rejection', 'receive', {
          reason: 'rejected',
          ...(event.sourceCode === 'InvalidApiKey' ||
          event.sourceCode === 'invalid_api_key'
            ? { sourceCode: event.sourceCode }
            : {}),
        });
        end({
          reason: 'rejected',
          message: SPEECH_SESSION_MESSAGES.rejected,
          ...(event.sourceCode === undefined
            ? {}
            : { sourceCode: event.sourceCode }),
        });
        return;
      case 'invalid':
        recordFailure('read_event', 'receive', { reason: 'protocol' });
        fail('protocol');
        return;
      case 'ignored':
        return;
    }
  }

  async function prepare(): Promise<void> {
    const words = input.readVocabulary
      ? Promise.race([
          Promise.resolve().then(() =>
            active && accepting
              ? input.readVocabulary!({ signal: vocabularyController.signal })
              : [],
          ),
          new Promise<readonly string[]>((resolve) =>
            vocabularyController.signal.addEventListener(
              'abort',
              () => resolve([]),
              { once: true },
            ),
          ),
        ]).catch((error) => {
          if (active && !vocabularyController.signal.aborted)
            recordFailure(
              'read_vocabulary',
              'prepare',
              getFailureDiagnostics(error),
            );
          return [];
        })
      : undefined;
    try {
      const result = await credentials.get({ signal: controller.signal });
      if (!active) return;
      if (result.status !== 'success') {
        fail('credential');
        return;
      }
      credential = result.credential;
      if (words) {
        const names = await words;
        if (!active) return;
        vocabulary = names;
      }
      if (!active) return;
    } catch (error) {
      if (active)
        recordFailure('credential', 'prepare', getFailureDiagnostics(error));
      fail('credential');
      return;
    }
    let operation = 'create_task';
    try {
      taskId = input.createUuid();
      if (!active) return;
      operation = 'open_socket';
      socket = new WebSocket(new URL(credential.wsUrl).toString(), undefined, {
        headers: { Authorization: `Bearer ${credential.token}` },
      });
      operation = 'configure_socket';
      socket.binaryType = 'arraybuffer';
      operation = 'listen_open';
      socket.addEventListener('open', handleOpen);
      if (!active) return;
      operation = 'listen_message';
      socket.addEventListener('message', handleMessage);
      if (!active) return;
      operation = 'listen_error';
      socket.addEventListener('error', handleTransportError);
      if (!active) return;
      operation = 'listen_close';
      socket.addEventListener('close', handleTransportClose);
    } catch (error) {
      if (active)
        recordFailure(operation, 'connect', getFailureDiagnostics(error));
      fail('transport');
    }
  }

  prepare();
  return { sendAudio, finish, close };
}
