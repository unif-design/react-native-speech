# 原生依赖与补丁

## 已采用的宿主

| 依赖                                | 版本与作用                                                      |
| ----------------------------------- | --------------------------------------------------------------- |
| React / React Native                | peer 范围为 >=19.3.1 / >=0.88.1；本仓开发组合为 19.3.1 / 0.88.1 |
| Expo / Expo Modules Core            | 58.0.20 / 58.0.27，原生模块注册与生命周期                       |
| expo-audio                          | **58.0.10**，宿主维护并应用对应补丁                             |
| @unif/react-native-logger           | ^0.1.3，宿主共享日志运行时                                      |
| react-native-url-polyfill / zustand | ^4.0.0 / ^5.0.16，由本库声明                                    |

表中的开发组合不代表所有受支持版本组合均已完成设备验证。完整依赖声明见 [package.json](https://github.com/unif-design/react-native-speech/blob/main/package.json)。

UUID 由宿主函数提供；示例使用 `expo-crypto@58.0.7` 的 `randomUUID`。库本体不强制采用该 UUID SDK。

## 宿主准备 SDK

音频补丁由宿主统一维护和应用；本库不包含 `.patch` 副本，不提供自动修改消费者依赖的安装脚本。宿主需使用其维护的 `expo-audio+58.0.10.patch` 准备同版 SDK，再重新安装 Pods 并重建 Android／iOS。OTA 更新不能交付原生修订。

必要能力为：事件包含实际 encoding，严格采用真实短读字节；Android fallback 采样转换使用 SDK 已采用的 Media3 SonicAudioProcessor；两端明确交付 format／unavailable／interrupted／cleanup 错误；启动失败和 stop/release 均完成资源收尾。实际采集与宿主 SDK 验证以这些能力为前置。

验证环境应从宿主唯一的补丁来源取得修订。应用前核对精确 SDK 版本与来源摘要，应用后核对实际解析到的包及 iOS／Android 编译使用同一份 SDK，不能只修补另一个依赖副本。独立消费者或 example 必须完成相同准备；安装本 npm 包本身不具备这一步。

干净消费者先通过 `npm install /absolute/path/to/speech.tgz` 安装本库实际 `npm pack` 产物和上述精确依赖，保留安装生成的 package-lock.json。按宿主管理流程应用音频补丁，将仓库 `validation/consumer.ts`、`validation/sdk-types.ts` 和 `validation/tsconfig.json` 复制到该消费者根目录。前者验证本库公开 API，SDK 夹具单独验证宿主实际采用的补丁声明。

在本库根目录执行以下校验，两个路径由验证者替换为实际位置：

```sh
UNIF_SPEECH_CONSUMER=/absolute/path/to/consumer \
UNIF_SPEECH_TARBALL=/absolute/path/to/speech.tgz \
yarn test:consumer
```

该校验读取消费者，不自动安装、应用补丁或修改依赖。它检查 tarball 与锁文件摘要、公开类型出口、共享运行时和已采用 SDK 文件，并要求两个完整类型夹具实际参与严格编译；消费者中的本库必须是正常解包目录，不能是 workspace 或源码 symlink。完整原生验证还需在该干净宿主中完成 Pods／Gradle 接线、构建和设备检查。

库 CI 安装官方 SDK 验证库代码、类型、产物和示例编译，无需取得 Portal 补丁。库读取的扩展事件字段在采集边界校验，格式校验和错误处理不因原版声明缺少字段而省略。补丁声明与原生行为由已修补宿主验证；库 CI 通过不能替代该集成结果。运行产物和本机路径留在仓库外。

## Expo Modules

将 Expo Modules 按当前版本接入原生工程。仓库 example 提供实际的 Gradle autolinking、Android Application／Activity 生命周期、Podfile、ExpoAppDelegate／SceneDelegate 接线。库仅依赖已有模块，没有自有原生桥接。

宿主 `package.json` 必须包含：

```json
{
  "expo": {
    "autolinking": {
      "android": { "buildFromSource": ["expo-audio"] }
    }
  }
}
```

这一设置让 Android 编译已打补丁的源码。省略它可能采用未包含补丁的预编译 SDK，即使 JS 和类型检查通过也不满足采集契约。

iOS 配置 `NSMicrophoneUsageDescription`；Android 声明 `android.permission.RECORD_AUDIO`。权限申请由 `VoiceInputPermissions` 的宿主实现负责，采集函数不重复申请。真实权限结果必须由 `read(['microphone'])` 交付。

Expo Go 无法携带这份原生补丁。网站和 Web 的 unsupported 结果也不能验证实际 PCM、硬件中断或麦克风释放。

## Web 消费检查

Web 宿主按 RN Web 配置 `react-native` 别名。本库的采集和识别保持 unsupported，不调用原生 SDK、凭证或 UUID。验证时在同一干净消费者安装组织采用的 `react-native-web@0.21.4`，设置 `UNIF_SPEECH_CONSUMER` 后运行 `yarn test:web-consumer`；它使用真实 tarball 的浏览器入口编译，并拒绝引入原生音频 SDK。该构建不能代替 iOS／Android 的设备和服务验收。
