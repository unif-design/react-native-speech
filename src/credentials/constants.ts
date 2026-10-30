export const SPEECH_CREDENTIAL_MARGIN_SECONDS = 60;
export const SPEECH_CREDENTIAL_MESSAGES = {
  access: '语音服务访问已失效，请重新登录。',
  rejected: '语音服务暂时未允许获取凭证，请稍后重试。',
  invalid_response: '语音凭证响应无法确认，请稍后重试。',
  unavailable: '暂时无法获取语音凭证，请稍后重试。',
} as const;
