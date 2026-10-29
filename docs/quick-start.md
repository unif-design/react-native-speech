# 快速开始

## 安装

```sh
npm install @unif/react-native-speech @unif/react-native-logger expo-audio@58.0.10
```

补丁由宿主统一维护和应用，本包不分发副本或执行自动安装脚本。使用 Expo 58.0.20、Expo Modules Core 58.0.27、React 19.3.1、React Native 0.88.1 的原生宿主；完成[原生接线](native-setup.md)后重建。

## 创建识别入口

```ts
import { createSpeechCredentialAccess } from '@unif/react-native-speech/credentials';
import type { SpeechCredentialRequest } from '@unif/react-native-speech/credentials';
import { openSpeechSession } from '@unif/react-native-speech/realtime';
import type { SpeechSessionOpener } from '@unif/react-native-speech/realtime';

function bindRecognition(request: SpeechCredentialRequest, createUuid: () => string) {
  const credentials = createSpeechCredentialAccess(request);
  const openRecognition: SpeechSessionOpener = handlers =>
    openSpeechSession({ credentials, createUuid }, handlers);
  return { openRecognition, dispose: credentials.dispose };
}
```

`request` 由宿主绑定一个有效身份范围和真实服务，返回 `SpeechCredentialResult`。不要在组件重渲染时重新创建凭证访问。`createUuid` 采用宿主既有 UUID；本库不自行生成随机标识。

## 连接输入

```ts
import { useVoiceInput } from '@unif/react-native-speech/input';
import type { UseVoiceInputOptions } from '@unif/react-native-speech/input';

export function useInput(options: UseVoiceInputOptions) {
  return useVoiceInput(options);
}
```

传入 `permissions`、已绑定的 `openRecognition` 与本次结果接收函数。点击麦克风调用 `start()`，停止调用 `stop()`，取消调用 `cancel('user')`。`state` 和 `transcript` 只用于展示；最终 `onResult` 由宿主应用到原草稿。

身份或业务上下文结束时调用 `cancel('context_ended')`，关闭该身份的识别句柄并 `dispose()` 凭证访问。组件卸载会静默结束自己的输入；同身份 token 更新和换身份由宿主区分。
