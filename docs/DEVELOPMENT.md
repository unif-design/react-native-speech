---
id: development
slug: /development
---

# 研发与验证

本库采用组织标准 `a29d71586a63a1b39d9a3acc446741289150ac41`，包括等价提取、SDK 补丁交付及真实消费者要求。源码分为凭证、实时识别、采集和输入四个单元；宿主保留身份、平台换凭证、业务词表及界面。内部协议与轮次协调器不公开，默认值、错误、取消、并发和资源归属保持原契约。

```sh
yarn install --immutable
yarn typecheck
yarn test --runInBand
yarn build
yarn test:consumer
yarn website typecheck
yarn website test
yarn website build
yarn example android
yarn example ios
```

example 保留实际 iOS／Android 工程、Expo Modules 注册与麦克风权限。运行后输入服务端签发的临时 token、expiresAtSeconds、wsUrl，点击开始录音；不使用固定或模拟识别结果。不提交真实凭证，示例只在内存持有它们。

行为测试运行真实缓存、协议、会话和输入组合，替换网络、权限及麦克风边界。SDK 测试从真实已打补丁包的公开入口核对数据和方法；原生边界夹具核对完整 SDK 类的受控系统绑定。`test:consumer` 检查验证环境已经准备好的干净消费者及其真实 tarball、公开入口和类型；准备步骤见原生接线。测试脚本不安装或修改消费者 SDK。

原生边界测试单独在 CI 中编译 Kotlin／Swift，系统绑定受控，不等同硬件验证。完整原生构建、实际短读／采样转换、系统中断、权限拒绝、取消、重复接管、资源释放和真实服务转写分别记录；网站构建与 Web unsupported 不能替代这些结果。

采用组织 `.github` 的 CI、保护规则、发布和 LLM 文档生成器。开发、测试、审查、交付分别使用 `unif-portal-dev-skills:code-development`、`code-testing`、`code-review`、`code-delivery`，无需安装不存在的 Speech 专项技能。公共协议、输入默认值、终态和原生补丁变化必须复核实际消费者。

Git 提交和 PR 使用中文；正式 npm 版本经受保护分支与 release.yml 的 Trusted Publisher 发布。发布包校验、网站部署与设备验收各自提供证据。原始运行产物与个人设备记录留在仓库外。
