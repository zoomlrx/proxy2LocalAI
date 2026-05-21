# 贡献指南

感谢你愿意参与 Proxy2LocalAI。这个项目的核心目标是：只代理用户明确配置的 API 请求，并把请求交给本机可信的 AI CLI 处理。

## 开发环境

- Node.js >= 20
- npm >= 10
- Chrome 或 Edge，用于加载 MV3 扩展
- 可选：Claude Code、Codex 或自定义 CLI，用于真实联调

```powershell
npm install
npm test
npm run typecheck
npm run build
```

## 本地开发流程

1. 从一个小问题开始，避免一次 PR 混入多个方向。
2. 涉及运行时代码时，优先先补测试，再改实现。
3. 修改浏览器扩展后运行 `npm run build`，并在扩展管理页重新加载 `apps/extension/dist`。
4. 修改 Bridge 后运行 `npm run start:bridge` 和 `npm run doctor` 做基本验证。
5. 提交 PR 前至少运行 `npm test`、`npm run typecheck`、`npm run build`。

## 代码风格

- TypeScript 开启严格模式，尽量保持类型边界清晰。
- 用户可见文案和项目文档优先使用中文。
- 不在日志中记录 token、Authorization 或完整敏感请求头。
- 不引入大依赖来解决小问题；如果确实需要依赖，请在 PR 中说明取舍。

## 安全相关改动

涉及以下内容时，请在 PR 中单独说明风险和验证方式：

- 浏览器权限、DNR 规则、host permissions。
- Bridge 鉴权、CORS、端口监听、请求体读取。
- Provider 命令参数，尤其是会改变本机文件、执行命令或跳过权限确认的参数。
- 配置导入导出、日志、token 存储。

安全漏洞请不要直接提交公开 issue，处理方式见 [SECURITY.md](SECURITY.md)。
