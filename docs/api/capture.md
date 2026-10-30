# 按次音频采集

从 `@unif/react-native-speech/capture` 导入 `openAudioCapture`。

`openAudioCapture(input: Readonly<AudioCaptureInput>, handlers: AudioCaptureHandlers): AudioCapture` 为本次创建独立的 Expo AudioStream。input 显式指定正整数 sampleRate、channels（1 或 2）、encoding（int16 或 float32）。handlers 接收 `onBuffer(PcmAudioBuffer)` 与 `onError(AudioCaptureError)`。

PCM 的 data 是 ArrayBuffer，sampleRate、channels、encoding 表达实际字节格式。int16 使用小端，多声道为交错排列。未知编码、非整帧或无法确认的格式明确失败，不以请求参数冒充实际输出；不保存录音文件，不申请权限或连接服务。

| 回执 | 结果 |
| --- | --- |
| started: Promise&lt;AudioCaptureStartResult&gt; | started、cancelled 或 failed/error |
| stop(): Promise&lt;AudioCaptureStopResult&gt; | stopped 或 failed/error；重复调用共享同一次结果 |

`AudioCaptureError.reason` 为 `invalid_input | unsupported | format | unavailable`，message 为固定中文。开始失败由 started 交付；开始后的可观察错误只通知一次并收尾。stop 先停止采用新块，等待自己的 start 落定，再停止原生采集、移除监听和 release。取消启动不等于资源已释放。

公开类型：`AudioCaptureInput`、`PcmAudioBuffer`、`AudioCaptureError`、`AudioCaptureHandlers`、`AudioCaptureStarted`、`AudioCaptureCancelled`、`AudioCaptureFailed`、`AudioCaptureStartResult`、`AudioCaptureStopped`、`AudioCaptureStopResult`、`AudioCapture`。Web 使用相同句柄契约交付 unsupported。
