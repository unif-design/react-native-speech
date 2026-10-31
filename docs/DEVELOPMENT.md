---
id: development
slug: /development
---

# 研发与验证

本库提取时采用组织标准修订 `a29d71586a63a1b39d9a3acc446741289150ac41`，包括等价提取、SDK 补丁交付及真实消费者要求。源码分为凭证、实时识别、采集和输入四个单元；宿主保留身份、平台换凭证、业务词表及界面。内部协议与轮次协调器不公开，默认值、错误、取消、并发和资源归属保持原契约。

```sh
yarn install --immutable
yarn typecheck
yarn test --runInBand
yarn build
yarn website typecheck
yarn website test
yarn website build
yarn example android
yarn example ios
```

example 保留实际 iOS／Android 工程、Expo Modules 注册与麦克风权限。运行后输入服务端签发的临时 token、expiresAtSeconds、wsUrl，点击开始录音；不使用固定或模拟识别结果。不提交真实凭证，示例只在内存持有它们。

库 CI 使用官方 SDK 完成类型检查、行为测试、打包和示例编译。行为测试运行真实缓存、协议、会话和输入组合，替换网络、权限及麦克风边界；原有编码校验、中断、失败和清理断言保持不变。事件扩展字段在库边界检查，不要求 SDK 的原版声明先被修改。

宿主集成另行验证修补后的 SDK。`test:consumer` 检查已准备好的干净消费者、真实 tarball、公开入口、补丁声明及 SDK 文件摘要；准备步骤见原生接线。原生边界夹具供具备已修补 SDK 的验证环境编译 Kotlin／Swift，系统绑定受控，不等同硬件验证。测试脚本不安装或修改消费者 SDK。

正式交付同时需要库 CI 与宿主集成证据。完整原生构建、实际短读／采样转换、系统中断、权限拒绝、取消、重复接管、资源释放和真实服务转写分别记录；官方 SDK 的示例编译、网站构建与 Web unsupported 均不能替代补丁行为验证。

当前 CI、保护规则、发布和共享 LLM 工具的维护来源见[交付配置与检查](#交付配置与检查)。通用规范使用 `uni-skills`：`code-organization` 说明目录与文件组织，`react-native-development` 说明 RN 实现要求，`react-native-library` 说明独立库与消费者验证，`documentation` 说明文档与文档站维护。Unif 的设计、测试、审查和交付按 `unif-portal-dev-skills` 对应技能执行；本库接口与行为以公开类型和有效契约为准。公共协议、输入默认值、终态和原生补丁变化必须复核实际消费者。

Git 提交和 PR 使用中文；正式 npm 版本经受保护分支与 release.yml 的 Trusted Publisher 发布。发布包校验、网站部署与设备验收各自提供证据。原始运行产物与个人设备记录留在仓库外。

## 交付配置与检查

共享 CI、发布配置和检查工具由 `github-delivery` 的模板与工具维护。Unif 组织值由 `code-delivery` 的 `assets/organization.json` 维护，接入时落实为本库 `.github/organization.json`，记录组织、包名规则、Pages 地址、发布 App 身份及远端设置。工具运行时读取项目文件，不依赖其他技能的安装目录；适用技能按当前任务独立选择。

在仓库根目录按阶段执行：

| 命令 | 检查范围 |
| --- | --- |
| `node .github/scripts/check-delivery.cjs` | 离线检查受管文件、组织配置与 source 元数据。 |
| `node .github/scripts/check-library.cjs pack` | 完成库构建后，检查当前 tarball 的导出、声明与文件清单。 |
| `node .github/scripts/check-library.cjs release` | 发行前校验 README、许可和发布配置，不执行发布。 |
| `node .github/scripts/check-library.cjs published` | 联网核验 npm 当前版本的元数据、下载完整性与实际 tarball。 |

CI 与发布步骤见本库 `.github/workflows/`，组织配置调整以项目文件及当前授权为准。本地检查、远端 CI、npm 发布、文档部署和设备验收分别报告。
