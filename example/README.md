# Speech 原生示例

实际使用 `@unif/react-native-speech` 公开入口、Expo Audio 58.0.10 及宿主准备的原生补丁。RN 0.88.1 的 iOS/Android 工程已保留，使用 Expo Modules 的 Application/Activity、AppDelegate/SceneDelegate 与 autolinking 接线。

从仓库根目录安装依赖，并由验证环境使用宿主唯一维护的音频补丁准备实际解析到的 expo-audio，再运行 `yarn example android`，或在 example/ios 中 `bundle install && bundle exec pod install` 后运行 `yarn example ios`。Android 明确从源码构建 expo-audio。示例不支持 Expo Go。

打开应用，输入由服务端签发的临时 token、expiresAtSeconds（Unix 秒）和 wsUrl，应用凭证后开始录音。凭证只保存在内存，不填写长期密钥。重新应用凭证会结束旧输入，清理旧凭证范围。开始、停止、取消、阶段、展示文字和最终结果均来自真实库。

麦克风权限由 Expo Audio 的公开权限 API 提供。UUID 由 expo-crypto@58.0.7 生成；应用可以改为传入自己的原有 UUID 函数。没有服务端临时凭证时可验证构建和权限流程，不能据此宣称真实识别已通过。
