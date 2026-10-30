import { SPEECH_AUDIO_FORMAT } from '@unif/react-native-speech/realtime';
import {
  createSpeechFinishCommand,
  createSpeechStartCommand,
  readSpeechEvent,
} from '../../src/realtime/speechProtocol';

const taskId = '123e4567-e89b-12d3-a456-426614174000';

function serverEvent(
  event: string,
  payload?: unknown,
  header: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    header: { task_id: taskId, event, ...header },
    ...(payload === undefined ? {} : { payload }),
  });
}

test('run-task 是可直接发送的固定识别命令并采用公开采集配置', () => {
  expect(SPEECH_AUDIO_FORMAT).toEqual({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
  });
  expect(Object.isFrozen(SPEECH_AUDIO_FORMAT)).toBe(true);
  expect(createSpeechStartCommand(taskId)).toBe(
    JSON.stringify({
      header: {
        action: 'run-task',
        task_id: taskId,
        streaming: 'duplex',
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: 'qwen-audio-3.0-asr-flash-streaming',
        parameters: { format: 'pcm', sample_rate: 16000 },
        input: {},
      },
    }),
  );
});

test('finish-task 只携带同一任务、双工模式与空输入', () => {
  expect(createSpeechFinishCommand(taskId)).toBe(
    JSON.stringify({
      header: {
        action: 'finish-task',
        task_id: taskId,
        streaming: 'duplex',
      },
      payload: { input: {} },
    }),
  );
});

test('本次语音词表进入识别热词与上下文，使用正确商品名而非错字替换表', () => {
  const command = JSON.parse(
    createSpeechStartCommand(taskId, [
      ' 小茗同学 ',
      '焕神',
      '冰红茶',
      '冰绿茶',
      '阿萨姆奶茶',
      '小茗同学',
      '',
    ]),
  );
  expect(command.payload.parameters.vocabulary).toEqual({
    小茗同学: 4,
    焕神: 4,
    冰红茶: 4,
    冰绿茶: 4,
    阿萨姆奶茶: 4,
  });
  expect(command.payload.input.context).toEqual([
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: '小茗同学、焕神、冰红茶、冰绿茶、阿萨姆奶茶',
        },
      ],
    },
  ]);
});

test('词表按供应商限制裁剪，长商品名不截成另一个热词', () => {
  const longName = '超过十五个汉字的真实商品完整规格名称';
  const words = [
    longName,
    ...Array.from({ length: 2001 }, (_, i) => `商品${i}`),
  ];
  const command = JSON.parse(createSpeechStartCommand(taskId, words));
  expect(command.payload.parameters.vocabulary).not.toHaveProperty(longName);
  expect(Object.keys(command.payload.parameters.vocabulary)).toHaveLength(2000);
  const context = command.payload.input.context[0].content[0].text;
  expect(Array.from(context)).toHaveLength(context.length);
  expect(context.length).toBeLessThanOrEqual(400);
  expect(context.startsWith(longName)).toBe(true);
  expect(words).toHaveLength(2002);
});

test.each([
  ['task-started', { type: 'started' }],
  ['task-finished', { type: 'finished' }],
] as const)('%s 投影为 %p', (event, expected) => {
  expect(readSpeechEvent(serverEvent(event), taskId)).toEqual(expected);
});

test('空 partial 合法且缺失 sentence_id 时不补造标识', () => {
  const event = serverEvent('result-generated', {
    output: { sentence: { text: '', sentence_end: false } },
  });

  const result = readSpeechEvent(event, taskId);

  expect(result).toEqual({ type: 'partial', text: '' });
  expect(result).not.toHaveProperty('sentenceId');
});

test('final 保留原始文字与有效 sentence_id 并忽略官方扩展字段', () => {
  const event = JSON.stringify({
    header: {
      task_id: taskId,
      event: 'result-generated',
      attributes: { trace_id: 'fixture-trace' },
    },
    payload: {
      output: {
        sentence: {
          sentence_id: 7,
          text: ' 原样文字 ',
          sentence_end: true,
          words: [{ text: '原样' }],
        },
      },
      usage: { duration: 120 },
    },
  });

  expect(readSpeechEvent(event, taskId)).toEqual({
    type: 'final',
    text: ' 原样文字 ',
    sentenceId: 7,
  });
});

test('heartbeat 优先忽略，不要求文字、结束标识或有效 sentence_id', () => {
  const event = serverEvent('result-generated', {
    output: { sentence: { heartbeat: true, sentence_id: 0 } },
  });

  expect(readSpeechEvent(event, taskId)).toEqual({ type: 'ignored' });
});

test('其他任务的已知事件即使 payload 损坏也忽略', () => {
  const event = JSON.stringify({
    header: { task_id: 'another-task', event: 'result-generated' },
    payload: { output: { sentence: null } },
  });

  expect(readSpeechEvent(event, taskId)).toEqual({ type: 'ignored' });
});

test('当前任务可辨认的扩展事件忽略且不检查未知 payload', () => {
  const event = serverEvent('service-metadata-updated', 'future-payload');

  expect(readSpeechEvent(event, taskId)).toEqual({ type: 'ignored' });
});

test('task-failed 即使缺少可选诊断仍是明确失败', () => {
  expect(readSpeechEvent(serverEvent('task-failed'), taskId)).toEqual({
    type: 'failed',
  });
  expect(
    readSpeechEvent(
      serverEvent('task-failed', undefined, {
        error_code: 'InvalidApiKey',
        error_message: 'private-provider-detail',
      }),
      taskId,
    ),
  ).toEqual({ type: 'failed', sourceCode: 'InvalidApiKey' });
});

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null])(
  '提供的 sentence_id=%p 不是正安全整数时返回 invalid',
  (sentenceId) => {
    const event = serverEvent('result-generated', {
      output: {
        sentence: {
          text: '文字',
          sentence_end: false,
          sentence_id: sentenceId,
        },
      },
    });

    expect(readSpeechEvent(event, taskId)).toEqual({ type: 'invalid' });
  },
);

test.each([
  ['not-json'],
  [JSON.stringify(null)],
  [JSON.stringify({})],
  [JSON.stringify({ header: { task_id: taskId } })],
  [serverEvent('result-generated')],
  [serverEvent('result-generated', { output: {} })],
  [
    serverEvent('result-generated', {
      output: { sentence: { sentence_end: false } },
    }),
  ],
  [
    serverEvent('result-generated', {
      output: { sentence: { text: '文字' } },
    }),
  ],
] as const)('无法解释的当前协议消息返回 invalid：%s', (data) => {
  expect(readSpeechEvent(data, taskId)).toEqual({ type: 'invalid' });
});
