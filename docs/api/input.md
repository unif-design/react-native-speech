# 语音输入 Hook

`useVoiceInput(options: UseVoiceInputOptions): VoiceInput` 从 `@unif/react-native-speech/input` 导入。

options 包含 `permissions: VoiceInputPermissions`、`openRecognition: SpeechSessionOpener`、`onResult(result)`。permissions 只需提供 `request('microphone'): Promise<void>` 和 `read(['microphone'])`；read 交付含 id/status 的实际权限记录，只有 microphone/granted 可以继续。

返回 state、transcript、start、stop、cancel。state 为 `idle | starting | listening | finishing | error`；transcript 是本轮已定稿与当前 partial 的展示值，不是业务草稿。重复 start 不开新轮，stop 关闭音频采用后并行结束采集与识别，cancel 默认为 user。

权限通过后 60000ms 到点开始停止，停止后的服务端等待上限为 2000ms。正常结果必须同时等待原生采集收尾；识别超时不冒充麦克风已释放。

| VoiceInputResult | 字段与采用 |
| --- | --- |
| text | text 与 completion（confirmed / unconfirmed）；未确认文字仍可供编辑 |
| failed | reason（permission / capture / recognition）、message、finalText；仅保留已定稿文字 |
| cancelled | reason（user / replaced）；不改草稿 |

`cancel('context_ended')` 和卸载静默结束本轮，不再调用旧接收方。新输入接管结束旧输入的文字采用，并等待真实旧采集释放；旧停止失败阻止新采集。普通重渲染只影响下次开始，本轮保持原依赖和 onResult。

本 Hook 不查询业务目录、不读取账号、不拼接草稿或自动发送。身份结束需要宿主同时关闭所属识别会话和 dispose 凭证。

公开类型：`VoiceInputPermissions`、`VoiceInputState`、`VoiceInputText`、`VoiceInputCancelled`、`VoiceInputFailed`、`VoiceInputResult`、`UseVoiceInputOptions`、`VoiceInput`。内部轮次与所有权协调器不作为公共 API。
