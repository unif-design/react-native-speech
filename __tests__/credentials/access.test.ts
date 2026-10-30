import * as logging from '@unif/react-native-logger';
import { createSpeechCredentialAccess } from '@unif/react-native-speech/credentials';
import type {
  SpeechCredential,
  SpeechCredentialOptions,
  SpeechCredentialRequest,
  SpeechCredentialResult,
} from '@unif/react-native-speech/credentials';

jest.mock('@unif/react-native-logger', () => ({
  ...jest.requireActual('@unif/react-native-logger'),
  createLogger: jest.fn(
    jest.requireActual('@unif/react-native-logger').createLogger,
  ),
}));

const now = Date.UTC(2026, 8, 18, 2, 0, 0);
const original: SpeechCredential = {
  token: 'fixture-original',
  expiresAtSeconds: now / 1000 + 300,
  wsUrl: 'wss://speech.example.invalid/asr',
};
const newer: SpeechCredential = { ...original, token: 'fixture-newer' };
const invalidResponse = {
  status: 'failed',
  reason: 'invalid_response',
  message: '语音凭证响应无法确认，请稍后重试。',
};
const unavailable = {
  status: 'failed',
  reason: 'unavailable',
  message: '暂时无法获取语音凭证，请稍后重试。',
};

function success(credential = original): SpeechCredentialResult {
  return { status: 'success', credential };
}

function deferred() {
  let resolve!: (result: SpeechCredentialResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SpeechCredentialResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => jest.useFakeTimers().setSystemTime(now));
afterEach(() => jest.useRealTimers());

test('缓存访问只记录自身转换的原异常，已返回失败及取消后的迟到异常不重复告警', async () => {
  const warn = jest.fn();
  jest.spyOn(logging, 'createLogger').mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn,
    error: jest.fn(),
    captureError: jest.fn(),
  });
  const failure = Object.assign(new Error('private-token'), {
    code: 'ECONNRESET',
  });
  const request = jest
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(unavailable);
  const access = createSpeechCredentialAccess(request);
  expect(await access.get()).toEqual(unavailable);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    'credential.request_failed',
    expect.objectContaining({
      context: expect.objectContaining({ operationId: expect.any(String) }),
      phase: 'credential',
      fields: expect.objectContaining({
        operation: 'request',
        reason: 'connection_reset',
        sourceCode: 'ECONNRESET',
      }),
    }),
  );
  expect(await access.get()).toEqual(unavailable);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private-token');
  const late = deferred();
  request.mockReturnValueOnce(late.promise);
  const waiting = access.get();
  await flush();
  access.dispose();
  expect(await waiting).toEqual({ status: 'cancelled' });
  late.reject(failure);
  await flush();
  expect(warn).toHaveBeenCalledTimes(1);
});

test('上游成功但语音凭据校验失败由访问层记录且不输出凭据内容', async () => {
  const warn = jest.fn();
  jest.spyOn(logging, 'createLogger').mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn,
    error: jest.fn(),
    captureError: jest.fn(),
  });
  const request = jest.fn(async () =>
    success({ ...original, expiresAtSeconds: 0 }),
  );
  expect(await createSpeechCredentialAccess(request).get()).toEqual(
    invalidResponse,
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(
    'credential.invalid',
    expect.objectContaining({
      phase: 'validate',
      code: 'speech.credentials.invalid_response',
      fields: { operation: 'read_credential', reason: 'invalid_response' },
    }),
  );
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(
    /fixture-original|speech.example/,
  );
});

test('60001ms 余量复用；60000ms 余量仅本次 get 换发一次', async () => {
  const request = jest
    .fn<
      ReturnType<SpeechCredentialRequest>,
      Parameters<SpeechCredentialRequest>
    >()
    .mockResolvedValueOnce(success())
    .mockResolvedValueOnce(
      success({ ...newer, expiresAtSeconds: now / 1000 + 600 }),
    );
  const access = createSpeechCredentialAccess(request);
  expect(await access.get()).toEqual(success());
  jest.setSystemTime(now + 239999);
  expect(await access.get()).toEqual(success());
  expect(request).toHaveBeenCalledTimes(1);
  jest.setSystemTime(now + 240000);
  expect(await access.get()).toEqual(
    success({ ...newer, expiresAtSeconds: now / 1000 + 600 }),
  );
  expect(request).toHaveBeenCalledTimes(2);
});

test('实例只复用各自内存，不共享缓存', async () => {
  const request = jest.fn(async () => success());
  const first = createSpeechCredentialAccess(request);
  const second = createSpeechCredentialAccess(request);
  await first.get();
  await first.get();
  await second.get();
  expect(request).toHaveBeenCalledTimes(2);
});

test.each([
  {
    status: 'failed',
    reason: 'access',
    message: '语音服务访问已失效，请重新登录。',
    httpStatus: 403,
  },
  {
    status: 'failed',
    reason: 'rejected',
    message: '语音服务暂时未允许获取凭证，请稍后重试。',
    httpStatus: 429,
  },
  {
    status: 'failed',
    reason: 'unavailable',
    message: '暂时无法获取语音凭证，请稍后重试。',
    httpStatus: 503,
  },
  { status: 'cancelled' },
] as SpeechCredentialResult[])(
  '不缓存 $status/$reason 结果，不自动重试',
  async (result) => {
    const request = jest.fn(async () => result);
    const access = createSpeechCredentialAccess(request);
    expect(await access.get()).toEqual(result);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await access.get()).toEqual(result);
    expect(request).toHaveBeenCalledTimes(2);
  },
);

test.each([
  { ...original, token: '' },
  { ...original, expiresAtSeconds: now / 1000 + 60 },
  { ...original, expiresAtSeconds: Number.NaN },
  { ...original, wsUrl: 'https://speech.example.invalid/asr' },
])('success 的不可用凭证不交付、不缓存：%j', async (credential) => {
  const request = jest.fn(async () => success(credential));
  const access = createSpeechCredentialAccess(request);
  expect(await access.get()).toEqual(invalidResponse);
  expect(request).toHaveBeenCalledTimes(1);
  expect(await access.get()).toEqual(invalidResponse);
  expect(request).toHaveBeenCalledTimes(2);
});

test('在途期间进入 60 秒窗口的成功数据仍须拒绝', async () => {
  const response = deferred();
  const request = jest.fn<
    ReturnType<SpeechCredentialRequest>,
    Parameters<SpeechCredentialRequest>
  >(() => response.promise);
  const access = createSpeechCredentialAccess(request);
  const waiting = access.get();
  await flush();
  jest.setSystemTime(now + 240000);
  response.resolve(success());
  expect(await waiting).toEqual(invalidResponse);
  expect(request).toHaveBeenCalledTimes(1);
});

test('缓存交付前进入窗口，get 取得新凭证', async () => {
  const request = jest
    .fn(async () => success())
    .mockResolvedValueOnce(success());
  const access = createSpeechCredentialAccess(request);
  await access.get();
  jest.setSystemTime(now + 239999);
  const waiting = access.get();
  jest.setSystemTime(now + 240000);
  request.mockResolvedValue(
    success({ ...newer, expiresAtSeconds: now / 1000 + 600 }),
  );
  expect(await waiting).toEqual(
    success({ ...newer, expiresAtSeconds: now / 1000 + 600 }),
  );
  expect(request).toHaveBeenCalledTimes(2);
});

test('两个冷请求独立；较早迟到成功不覆盖较新已完成凭证', async () => {
  const first = deferred();
  const second = deferred();
  const request = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const access = createSpeechCredentialAccess(request);
  const earlier = access.get();
  const later = access.get();
  await flush();
  expect(request).toHaveBeenCalledTimes(2);
  second.resolve(success(newer));
  expect(await later).toEqual(success(newer));
  first.resolve(success());
  expect(await earlier).toEqual(success());
  expect(await access.get()).toEqual(success(newer));
  expect(request).toHaveBeenCalledTimes(2);
});

test('较新请求已经失败后，较早迟到成功不成为缓存', async () => {
  const first = deferred();
  const request = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({
      status: 'failed',
      reason: 'unavailable',
      message: unavailable.message,
    })
    .mockResolvedValueOnce(success(newer));
  const access = createSpeechCredentialAccess(request);
  const earlier = access.get();
  expect(await access.get()).toEqual(unavailable);
  first.resolve(success());
  expect(await earlier).toEqual(success());
  expect(await access.get()).toEqual(success(newer));
  expect(request).toHaveBeenCalledTimes(3);
});

test.each([
  newer,
  { ...original, expiresAtSeconds: original.expiresAtSeconds + 1 },
  { ...original, wsUrl: 'wss://other.example.invalid/asr' },
])('旧凭证 invalidate 不清不同实际字段的新缓存：%j', async (replacement) => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(success())
    .mockResolvedValueOnce(success(replacement));
  const access = createSpeechCredentialAccess(request);
  await access.get();
  access.invalidate({ ...original });
  expect(await access.get()).toEqual(success(replacement));
  access.invalidate({ ...original });
  expect(await access.get()).toEqual(success(replacement));
  expect(request).toHaveBeenCalledTimes(2);
});

test('同值凭证 invalidate 清缓存，下次 get 重新请求一次', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(success())
    .mockResolvedValueOnce(success(newer));
  const access = createSpeechCredentialAccess(request);
  await access.get();
  access.invalidate({ ...original });
  expect(request).toHaveBeenCalledTimes(1);
  expect(await access.get()).toEqual(success(newer));
  expect(request).toHaveBeenCalledTimes(2);
});

test('输入 DTO 后改或调用方写字段不能改写已交付凭证和内部缓存', async () => {
  const dto = { ...original, privateDetail: 'must-not-project' };
  const request = jest.fn(async () => success(dto));
  const access = createSpeechCredentialAccess(request);
  const result = await access.get();
  expect(result).toEqual(success());
  if (result.status !== 'success') throw new Error('expected success');
  expect(Object.isFrozen(result.credential)).toBe(true);
  expect(result.credential).not.toBe(dto);
  dto.token = 'changed-input';
  dto.wsUrl = 'wss://changed.example.invalid';
  dto.expiresAtSeconds = 0;
  expect(Reflect.set(result.credential, 'token', 'changed-output')).toBe(false);
  expect(await access.get()).toEqual(success());
  expect(result).toEqual(success());
  expect(request).toHaveBeenCalledTimes(1);
});

test('入口已取消不发请求，随后有效调用仍可请求', async () => {
  const request = jest.fn(async () => success());
  const access = createSpeechCredentialAccess(request);
  const controller = new AbortController();
  controller.abort();
  expect(await access.get({ signal: controller.signal })).toEqual({
    status: 'cancelled',
  });
  expect(request).not.toHaveBeenCalled();
  expect(await access.get()).toEqual(success());
  expect(request).toHaveBeenCalledTimes(1);
});

test.each(['abort', 'dispose'] as const)(
  '缓存交付前 %s 结束本次交付',
  async (action) => {
    const request = jest.fn(async () => success());
    const access = createSpeechCredentialAccess(request);
    await access.get();
    const controller = new AbortController();
    const waiting = access.get({ signal: controller.signal });
    if (action === 'abort') controller.abort();
    else access.dispose();
    expect(await waiting).toEqual({ status: 'cancelled' });
    expect(await access.get()).toEqual(
      action === 'abort' ? success() : { status: 'cancelled' },
    );
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test.each(['resolve', 'reject'] as const)(
  '取消一个等待独立结束；忽略取消的迟到 %s 不影响另一个等待/缓存',
  async (late) => {
    const first = deferred();
    const second = deferred();
    const request = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const access = createSpeechCredentialAccess(request);
    const controller = new AbortController();
    const earlier = access.get({ signal: controller.signal });
    const later = access.get();
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    controller.abort();
    let cancelled: SpeechCredentialResult | undefined;
    earlier.then((result) => {
      cancelled = result;
    });
    await flush();
    expect(cancelled).toEqual({ status: 'cancelled' });
    expect(request.mock.calls[0][0].signal.aborted).toBe(true);
    expect(request.mock.calls[1][0].signal.aborted).toBe(false);
    second.resolve(success(newer));
    expect(await later).toEqual(success(newer));
    if (late === 'resolve') first.resolve(success());
    else first.reject(new Error('private-late-rejection'));
    await flush();
    expect(await access.get()).toEqual(success(newer));
    expect(request).toHaveBeenCalledTimes(2);
  },
);

test.each(['resolve', 'reject'] as const)(
  'dispose 永久结束等待；忽略取消的迟到 %s 不能恢复，其他实例独立',
  async (late) => {
    const response = deferred();
    const request = jest.fn<
      ReturnType<SpeechCredentialRequest>,
      Parameters<SpeechCredentialRequest>
    >(() => response.promise);
    const access = createSpeechCredentialAccess(request);
    const waiting = access.get();
    await flush();
    access.dispose();
    let cancelled: SpeechCredentialResult | undefined;
    waiting.then((result) => {
      cancelled = result;
    });
    await flush();
    expect(cancelled).toEqual({ status: 'cancelled' });
    expect(request.mock.calls[0][0]?.signal?.aborted).toBe(true);
    if (late === 'resolve') response.resolve(success());
    else response.reject(new Error('private-disposed-rejection'));
    await flush();
    access.dispose();
    expect(await access.get()).toEqual({ status: 'cancelled' });
    expect(request).toHaveBeenCalledTimes(1);
    const newRequest = jest.fn(async () => success(newer));
    expect(await createSpeechCredentialAccess(newRequest).get()).toEqual(
      success(newer),
    );
    expect(newRequest).toHaveBeenCalledTimes(1);
  },
);

test.each(['original', 'replacement'] as const)(
  'options 后换 signal：只由入口捕获的原 signal 决定取消，取消 %s',
  async (aborted) => {
    const response = deferred();
    const request = jest.fn<
      ReturnType<SpeechCredentialRequest>,
      Parameters<SpeechCredentialRequest>
    >(() => response.promise);
    const access = createSpeechCredentialAccess(request);
    const first = new AbortController();
    const second = new AbortController();
    const options: SpeechCredentialOptions = { signal: first.signal };
    const waiting = access.get(options);
    options.signal = second.signal;
    await flush();
    (aborted === 'original' ? first : second).abort();
    response.resolve(success());
    expect(await waiting).toEqual(
      aborted === 'original' ? { status: 'cancelled' } : success(),
    );
    expect(request).toHaveBeenCalledTimes(1);
  },
);

test.each(['throw', 'reject'] as const)(
  'request %s 以固定中文 unavailable 结束，不泄露原错误、不缓存或重试',
  async (mode) => {
    const request = jest.fn(() => {
      if (mode === 'throw') throw new Error('private-request-error');
      return Promise.reject(new Error('private-request-error'));
    });
    const access = createSpeechCredentialAccess(request);
    expect(await access.get()).toEqual(unavailable);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await access.get()).toEqual(unavailable);
    expect(request).toHaveBeenCalledTimes(2);
  },
);

test.each(['abort', 'dispose'] as const)(
  'request 同步 %s 后 throw 仍交付 cancelled',
  async (action) => {
    const controller = new AbortController();
    const request = jest.fn(() => {
      if (action === 'abort') controller.abort();
      else access.dispose();
      throw new Error('private-request-error');
    });
    const access = createSpeechCredentialAccess(request);
    expect(await access.get({ signal: controller.signal })).toEqual({
      status: 'cancelled',
    });
    expect(request).toHaveBeenCalledTimes(1);
  },
);
