# 实时识别

从 `@unif/react-native-speech/realtime` 导入 `openSpeechSession`、`SPEECH_AUDIO_FORMAT`。

`openSpeechSession(input: Readonly<OpenSpeechSessionInput>, handlers: SpeechSessionHandlers): SpeechSession` 立即交付句柄。input 包含 `credentials`、必填 `createUuid(): string` 和可选 `readVocabulary`。

| 句柄 | 行为 |
| --- | --- |
| sendAudio(buffer) | 校验实际格式并接纳 PCM；准备期采用字节快照，握手后按原序发送 |
| finish() | 停止接纳新块，结束可选词表等待，队列发完后仅发送一次 finish |
| close() | 取消准备、解除监听并关闭本会话；不等待或投递后续终态 |

`SPEECH_AUDIO_FORMAT` 固定为 16000 Hz、单声道、int16 小端 PCM，模型为 `qwen-audio-3.0-asr-flash-streaming`。凭证通过 RN WebSocket 第三参数 Authorization header 发送，永不加入 URL。

handlers 包含 `onStarted()`、`onPartial(text)`、`onFinal(text)`、`onFinished()`、`onError(error)`。文字原样交付；有效 sentence_id 的定稿只投递一次，不按相同文字推断重复。服务端 task-finished 可提前正常结束。onFinished/onError 互斥，清理先于终态通知，迟到事件不能恢复会话。

`SpeechSessionError.reason` 为 `credential | audio_format | transport | protocol | rejected | unsupported`，包含固定中文 message 和可选实际 sourceCode。回调异常触发本会话清理，不向新接收方补结果。Web 异步交付 unsupported，不调用凭证、UUID 或 WebSocket。

`SpeechVocabularyReader` 接收 `{ signal }`，返回 `Promise<readonly string[]>`。词表与凭证并行准备，失败继续原识别；取消或 finish 结束本轮词表等待。协议按原规则去重、过滤超长词，最多 2000 个词、权重 4，context 最多 400 个 Unicode 字符且保留完整词；业务目录查询仍由宿主负责。

公开类型：`OpenSpeechSessionInput`、`SpeechSessionHandlers`、`SpeechSessionError`、`SpeechSession`、`SpeechSessionOpener`、`SpeechVocabularyReader`。会话不持有输入 Hook 的 60 秒／2 秒计时器，不重连、不重采样。
