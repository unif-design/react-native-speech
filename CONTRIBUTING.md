# 参与开发

本仓库包含语音库、原生 example 和 Docusaurus 文档站，使用 Yarn workspaces。先阅读 [研发与验证](docs/DEVELOPMENT.md)、[原生宿主前置](docs/native-setup.md)和 [AGENTS.md](AGENTS.md)。

安装依赖使用 `.nvmrc` 指定的 Node 和仓内 Yarn：

```sh
yarn install --immutable
```

音频 SDK 的补丁由宿主唯一维护。按宿主流程准备实际解析到的 expo-audio@58.0.10，再运行类型、行为与原生检查；不得把补丁复制进本仓或添加自动修改消费者 SDK 的安装脚本。

```sh
yarn lint
yarn typecheck
yarn test --runInBand
yarn test:scripts
yarn build
yarn website typecheck
yarn website test
yarn website build
```

example 从公开入口消费本库；干净消费者必须安装实际 tarball，具体步骤见原生宿主文档。分别报告源码、单测、打包、原生构建、设备及真实服务验证，不用 mock 或网页效果替代原生行为证据。

提交和 PR 标题、正文使用中文，并保留规范要求的类型前缀。通过组织 CI 和保护规则后合并；正式版本由 release.yml 的机器人及 npm Trusted Publisher 发布。已有调用、默认值、错误、取消及资源生命周期按契约保留，范围外改进先讨论，不能随等价迁移实施。
