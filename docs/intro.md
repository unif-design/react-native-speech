# Unif Speech

本库提供按次音频采集、身份范围内的临时凭证访问、实时识别会话及语音输入 Hook。

音频由 `expo-audio@58.0.10` 及配套补丁采集，识别通过 RN WebSocket 使用服务端签发的临时凭证。iOS／Android 需要完整原生宿主；Web 返回 `unsupported`。本库没有自有 TurboModule 或平台桥接。

宿主保留身份绑定、平台 HTTP 换凭证、业务词表、输入界面和草稿采用。库只交付本轮结果，不自动提交业务。

- [快速开始](quick-start.md)
- [原生依赖与补丁](native-setup.md)
- [凭证](api/credentials.md)、[识别会话](api/realtime.md)、[采集](api/capture.md)、[语音输入](api/input.md)
- [原生示例与验证](DEVELOPMENT.md)
