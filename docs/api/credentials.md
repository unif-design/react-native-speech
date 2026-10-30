# 凭证访问

从 `@unif/react-native-speech/credentials` 导入 `createSpeechCredentialAccess` 和同名契约类型。

`createSpeechCredentialAccess(request: SpeechCredentialRequest): SpeechCredentialAccess` 创建一个上下文内的访问对象。`get(options?)` 异步返回 `SpeechCredentialResult`，`options.signal` 仅取消本次等待；`invalidate(credential)` 只删除与实际使用值一致的缓存；`dispose()` 清空缓存并永久结束该实例。

| 结果 | 字段与含义 |
| --- | --- |
| success | `credential: Readonly<SpeechCredential>` |
| cancelled | 当前等待或访问生命周期已结束 |
| failed | `reason`、稳定中文 `message`，可选 `httpStatus` |

`SpeechCredential` 只有 `token: string`、`expiresAtSeconds: number`、`wsUrl: string`。token 必须非空，过期时间使用 Unix 秒；连接必须是无用户名、密码或片段的有效 `wss:` URL。不补默认地址。可用时间必须超过当前时间 60 秒。

失败原因 `SpeechCredentialFailureReason` 为 `access | rejected | invalid_response | unavailable`。`SpeechCredentialSuccess`、`SpeechCredentialCancelled`、`SpeechCredentialFailed` 组成 `SpeechCredentialResult`；`SpeechCredentialOptions`、`SpeechCredentialRequest`、`SpeechCredentialAccess` 一并公开。

较早请求不能覆盖较新已完成请求的缓存；取消等待不清除仍有效凭证。没有持久化、预刷新、后台定时器、冷请求自动合并或额外重试。识别明确收到 `InvalidApiKey`／`invalid_api_key` 时才使其使用的缓存失效，普通断网不触发换发。

宿主负责原身份的 HTTP 请求、响应结构校验和状态转换，库不携带企业 HTTP 客户端或服务地址。长期供应商密钥只能留在服务端；不要把凭证或原始错误正文写入日志。

`readSpeechCredential(value: unknown, nowSeconds = Date.now()/1000)` 供宿主响应适配复用同一可用性校验，返回冻结的凭证快照或 null。宿主仍保留自身服务协议的严格字段校验。`SPEECH_CREDENTIAL_MESSAGES` 公开固定失败文案，供 HTTP 结果转换采用，避免维护第二份同义消息。
