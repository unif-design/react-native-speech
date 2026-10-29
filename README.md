# @unif/react-native-speech

React Native 按次 PCM 音频采集、临时凭证缓存、实时语音识别与语音输入 Hook。iOS／Android 使用现有 Expo Audio 和 RN WebSocket；Web 的采集与识别明确返回 `unsupported`。

[文档网站](https://unif-design.github.io/react-native-speech/) · [npm](https://www.npmjs.com/package/@unif/react-native-speech) · [API](docs/api/input.md) · [原生示例](example/README.md) · [MIT 许可证](LICENSE)

## 安装与 peer 依赖

```sh
npm install @unif/react-native-speech @unif/react-native-logger expo-audio@58.0.10
```

依赖宿主 React 19.3.1、React Native 0.88.1、Expo 58.0.20 / Expo Modules 58.0.27。`expo-audio` 必须精确为 **58.0.10**，由宿主应用其维护的音频补丁；本包不分发补丁或自动修改 SDK。完成宿主的补丁准备后重新安装 Pods 并重建原生应用。Android 须配置 `expo.autolinking.android.buildFromSource: ["expo-audio"]`，详见[原生接线](docs/native-setup.md)。不能用 Expo Go 或网站验证该补丁。

`@unif/react-native-logger@^0.1.3` 是 peer，宿主及兄弟库共用同一实例；宿主按 logger 文档安装日志，不在每个识别会话初始化一次。

## 最小用法

```tsx
import { createSpeechCredentialAccess } from '@unif/react-native-speech/credentials';
import { openSpeechSession } from '@unif/react-native-speech/realtime';
import { useVoiceInput } from '@unif/react-native-speech/input';

// 在一个有效身份范围中创建。request 返回 SpeechCredentialResult，
// 内含服务端签发的临时 token、expiresAtSeconds、wsUrl。
const credentials = createSpeechCredentialAccess(request);

function useInput() {
  return useVoiceInput({
    permissions, // request('microphone')、read(['microphone'])
    openRecognition: handlers => openSpeechSession({
      credentials,
      createUuid, // 使用宿主原有 UUID 函数
    }, handlers),
    onResult(result) {
      // 按 result.status 采用文字、展示失败或保留原草稿；不自动发送。
    },
  });
}
```

这里的 `request`、`permissions`、`createUuid` 和结果采用由宿主提供，完整可运行接线见 [example](example/src/App.tsx)。身份结束时分别 `cancel('context_ended')`、关闭识别句柄和 `credentials.dispose()`；释放凭证不能替代停止麦克风。

## 公开 API

| 入口 | 能力 |
| --- | --- |
| `/credentials` | `createSpeechCredentialAccess(request)`、`readSpeechCredential`、固定失败文案与凭证类型；不加载录音 SDK |
| `/realtime` | `openSpeechSession(input, handlers)`、`SPEECH_AUDIO_FORMAT` 与会话类型；不启动麦克风 |
| `/capture` | `openAudioCapture(input, handlers)` 与实际 PCM、开始／停止结果类型 |
| `/input` | `useVoiceInput(options)` 与权限、阶段和一次性结果类型 |
| 包根 | 上述公开 API 的便捷汇总；按需使用独立入口避免加载不需要的能力 |

固定模型 `qwen-audio-3.0-asr-flash-streaming`，16000 Hz、int16 小端单声道。输入权限通过后最多 60000ms，停止后的识别等待最多 2000ms；这不替代原生资源收尾。partial/final、已确认／未确认文字、失败、取消分别交付，详见 [API 文档](docs/api/input.md)。

长期供应商密钥由服务端管理。库不包含平台 HTTP 客户端、账号 store 或业务词表；不会把 token、音频或识别全文写入诊断。

## 开发与验证

```sh
yarn install --immutable
yarn typecheck
yarn test --runInBand
yarn build
yarn test:consumer
yarn website typecheck
yarn website test
yarn website build
```

JS 测试、SDK 边界测试、打包／类型消费、原生构建和真机服务联调分别验证，详见[研发入口](docs/DEVELOPMENT.md)。真实服务凭证和设备由运行者提供。
