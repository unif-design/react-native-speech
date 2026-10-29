import type { AudioCaptureInput } from '../capture';

export const SPEECH_AUDIO_FORMAT: Readonly<AudioCaptureInput> = Object.freeze({
  sampleRate: 16000,
  channels: 1,
  encoding: 'int16',
});

export const SPEECH_RECOGNITION_MODEL = 'qwen-audio-3.0-asr-flash-streaming';
export const SPEECH_VOCABULARY_LIMIT = 2000;
export const SPEECH_VOCABULARY_WEIGHT = 4;
export const SPEECH_CONTEXT_CHARACTER_LIMIT = 400;

export const SPEECH_SESSION_MESSAGES = Object.freeze({
  credential: '无法获取语音识别凭证',
  audio_format: '音频格式不符合语音识别要求',
  transport: '语音识别连接失败',
  protocol: '无法解析语音识别响应',
  rejected: '语音识别服务拒绝了本次请求',
  unsupported: '当前平台不支持实时语音识别',
});
