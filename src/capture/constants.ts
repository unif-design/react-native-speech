export const AUDIO_CAPTURE_MESSAGES = {
  invalid_input: '音频采集配置无效',
  unsupported: '当前平台不支持音频采集',
  format: '无法确认采集音频的格式',
  unavailable: '音频采集不可用',
  cleanup: '未能确认音频采集已停止',
} as const;

export const PCM_BYTES_PER_SAMPLE = { int16: 2, float32: 4 } as const;
export const AUDIO_STREAM_FORMAT_ERROR_CODE = 'ERR_AUDIO_STREAM_FORMAT';
