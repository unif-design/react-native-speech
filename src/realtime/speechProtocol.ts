import type { SpeechProtocolEvent } from './types';
import {
  SPEECH_AUDIO_FORMAT,
  SPEECH_RECOGNITION_MODEL,
  SPEECH_VOCABULARY_LIMIT,
  SPEECH_VOCABULARY_WEIGHT,
  SPEECH_CONTEXT_CHARACTER_LIMIT,
} from './constants';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createSpeechStartCommand(
  taskId: string,
  words: readonly string[] = [],
): string {
  const terms = [...new Set(words.map((name) => name.trim()).filter(Boolean))];
  const hotwords = terms
    .filter((term) => {
      const characters = Array.from(term);
      return characters.some((character) => character.codePointAt(0)! > 127)
        ? characters.length <= 15
        : term.split(/\s+/u).length <= 7;
    })
    .slice(0, SPEECH_VOCABULARY_LIMIT);
  const vocabulary = Object.fromEntries(
    hotwords.map((term) => [term, SPEECH_VOCABULARY_WEIGHT]),
  );
  const contextTerms: string[] = [];
  let contextLength = 0;
  for (const term of terms) {
    const added = Array.from(term).length + (contextTerms.length ? 1 : 0);
    if (contextLength + added > SPEECH_CONTEXT_CHARACTER_LIMIT) continue;
    contextTerms.push(term);
    contextLength += added;
  }
  return JSON.stringify({
    header: {
      action: 'run-task',
      task_id: taskId,
      streaming: 'duplex',
    },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model: SPEECH_RECOGNITION_MODEL,
      parameters: {
        format: 'pcm',
        sample_rate: SPEECH_AUDIO_FORMAT.sampleRate,
        ...(hotwords.length ? { vocabulary } : {}),
      },
      input: contextTerms.length
        ? {
            context: [
              {
                role: 'user',
                content: [
                  { type: 'input_text', text: contextTerms.join('、') },
                ],
              },
            ],
          }
        : {},
    },
  });
}

export function createSpeechFinishCommand(taskId: string): string {
  return JSON.stringify({
    header: {
      action: 'finish-task',
      task_id: taskId,
      streaming: 'duplex',
    },
    payload: { input: {} },
  });
}

export function readSpeechEvent(
  data: unknown,
  taskId: string,
): SpeechProtocolEvent {
  if (typeof data !== 'string') return { type: 'invalid' };

  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return { type: 'invalid' };
  }
  if (!isRecord(message) || !isRecord(message.header))
    return { type: 'invalid' };

  const { event, task_id: messageTaskId } = message.header;
  if (
    typeof event !== 'string' ||
    event.length === 0 ||
    typeof messageTaskId !== 'string' ||
    messageTaskId.length === 0
  )
    return { type: 'invalid' };
  if (messageTaskId !== taskId) return { type: 'ignored' };

  if (event === 'task-started') return { type: 'started' };
  if (event === 'task-finished') return { type: 'finished' };
  if (event === 'task-failed') {
    const sourceCode = message.header.error_code;
    return typeof sourceCode === 'string'
      ? { type: 'failed', sourceCode }
      : { type: 'failed' };
  }
  if (event !== 'result-generated') return { type: 'ignored' };

  const payload = message.payload;
  if (!isRecord(payload) || !isRecord(payload.output))
    return { type: 'invalid' };
  const sentence = payload.output.sentence;
  if (!isRecord(sentence)) return { type: 'invalid' };
  if (sentence.heartbeat === true) return { type: 'ignored' };

  if (
    typeof sentence.text !== 'string' ||
    typeof sentence.sentence_end !== 'boolean'
  )
    return { type: 'invalid' };

  const hasSentenceId = Object.prototype.hasOwnProperty.call(
    sentence,
    'sentence_id',
  );
  if (
    hasSentenceId &&
    (!Number.isSafeInteger(sentence.sentence_id) ||
      (sentence.sentence_id as number) <= 0)
  )
    return { type: 'invalid' };

  if (sentence.sentence_end)
    return hasSentenceId
      ? {
          type: 'final',
          text: sentence.text,
          sentenceId: sentence.sentence_id as number,
        }
      : { type: 'final', text: sentence.text };
  return hasSentenceId
    ? {
        type: 'partial',
        text: sentence.text,
        sentenceId: sentence.sentence_id as number,
      }
    : { type: 'partial', text: sentence.text };
}
