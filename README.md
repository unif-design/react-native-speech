# @unif/react-native-speech

为 React Native 应用提供音频采集、临时凭证缓存、实时识别和语音输入 Hook。库交付文字与状态，由应用决定如何采用，不自动发送消息。

[文档站](https://unif-design.github.io/react-native-speech/) · [快速开始](docs/quick-start.md) · [API](docs/api/input.md) · [原生示例](example/README.md) · [npm](https://www.npmjs.com/package/@unif/react-native-speech) · [MIT 许可证](LICENSE)

## 接入要求

iOS／Android 需要完整原生宿主、麦克风权限和服务端签发的临时凭证。Expo Go 无法提供所需音频补丁；Web 可使用凭证校验和缓存，采集与识别返回 `unsupported`。

| 依赖         | 支持要求                 | 本仓开发组合 |
| ------------ | ------------------------ | ------------ |
| React        | `>=19.3.1`               | 19.3.1       |
| React Native | `>=0.88.1`               | 0.88.1       |
| Logger       | `^0.1.3`                 | 0.1.3        |
| expo-audio   | 精确 58.0.10，需宿主补丁 | 58.0.10      |

Expo Modules、权限和补丁配置见[原生接线](docs/native-setup.md)。补丁由宿主统一维护，本包不附带或自动应用；开发组合不代表全部版本组合已通过设备和识别服务验证。

## 安装与准备

1. 安装本库及依赖：

   ```sh
   npm install @unif/react-native-speech @unif/react-native-logger@^0.1.3 expo-audio@58.0.10
   ```

2. 按[原生接线](docs/native-setup.md)准备补丁后的 SDK，同步 iOS Pods 并重新构建应用。
3. 按[快速开始](docs/quick-start.md#创建识别入口)创建绑定当前身份的 `openRecognition`，并提供麦克风权限适配 `permissions`。临时凭证请求和 UUID 函数由宿主提供。

## 接入语音输入

下面的 Hook 使用上述两个宿主对象，`onResult` 由页面提供，用于处理本次文字、失败或取消结果：

```ts
import { useVoiceInput } from '@unif/react-native-speech/input';
import type { UseVoiceInputOptions } from '@unif/react-native-speech/input';

export function useMessageVoiceInput(
  onResult: UseVoiceInputOptions['onResult'],
) {
  return useVoiceInput({ permissions, openRecognition, onResult });
}
```

页面调用返回对象的 `start()`、`stop()` 或 `cancel('user')`，使用 `state` 和 `transcript` 展示过程。最终文字以 `onResult` 为准，由页面应用到草稿，详见[输入 API](docs/api/input.md)。

身份结束时调用 `cancel('context_ended')`，关闭所属识别会话并释放凭证访问。释放凭证不能替代停止麦克风；完整生命周期见[快速开始](docs/quick-start.md#连接输入)。

## 更多用法

- [凭证访问](docs/api/credentials.md)：校验、缓存、失效和宿主请求契约。
- [实时识别](docs/api/realtime.md)、[音频采集](docs/api/capture.md)：独立入口、PCM 格式和资源释放。
- [原生示例](example/README.md)：权限、凭证、录音和识别接线。
- [开发资料](docs/DEVELOPMENT.md)与[贡献指南](CONTRIBUTING.md)：构建、检查和交付。
