export const SPEECH_CREDENTIAL_MARGIN_SECONDS = 60;
export const SPEECH_CREDENTIAL_MESSAGES = {
  access: '登录状态暂时不可用，请确认登录后重试。',
  rejected: '请求较多，请稍后重试。',
  invalid_response: '返回的信息无法确认，请稍后重试。',
  unavailable: '服务暂时无法处理请求，请稍后重试。',
} as const;
export const SPEECH_CREDENTIAL_FORBIDDEN_MESSAGE = '当前账号无权进行此操作。';
