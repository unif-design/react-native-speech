# @unif/react-native-speech

为 React Native 应用提供音频采集、临时凭证缓存、实时语音识别和语音输入 Hook。支持 iOS／Android；Web 的采集与识别返回 `unsupported`。

[文档网站](https://unif-design.github.io/react-native-speech/) · [npm](https://www.npmjs.com/package/@unif/react-native-speech) · [API](docs/api/input.md) · [原生示例](example/README.md) · [MIT 许可证](LICENSE)

## 安装

```sh
npm install @unif/react-native-speech
```

依赖版本与原生配置见[接入文档](docs/native-setup.md)，完整接入流程见[快速开始](docs/quick-start.md)。

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

宿主负责身份、权限、服务端凭证请求和业务结果采用。输入默认值、结果与资源生命周期见 [API 文档](docs/api/input.md)。

## 开发

开发与验证见[研发文档](docs/DEVELOPMENT.md)，提交约定见[贡献指南](CONTRIBUTING.md)。
