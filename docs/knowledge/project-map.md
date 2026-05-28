# Proxy2LocalAI 项目地图

> 用途：当需要理解架构、命令、关键约定或排查代理链路时读取。入口规则仍以 `AGENTS.md` 为准。

## 架构概览

Proxy2LocalAI 是 npm workspaces monorepo，由三个包组成：

- `packages/shared` (`@proxy2localai/shared`)：共享类型定义和纯函数，包括 `ProxyProfile`、`AppConfig`、校验归一化、OpenAI 兼容响应构造、prompt 组装、SSE 解析、自定义 JSON 模板渲染、配置导入导出。平台无关，tsup 编译为 ESM。
- `apps/bridge` (`@proxy2localai/bridge`)：Node.js HTTP 服务。`server.ts` 处理 `/health`、`/doctor`、`/admin/profiles`、`/proxy/:profileId` 等路由；`providers.ts` 通过 `child_process.spawn` 调用 CLI；`doctor.ts` 提供自检报告。默认监听 `127.0.0.1:39399`。
- `apps/extension` (`@proxy2localai/extension`)：Chrome/Edge MV3 扩展。`background.ts` 作为 service worker，监听安装、启动和 storage 变化，通过 `sync.ts`、`bridgeApi.ts`、`dnr.ts`、`rules.ts` 同步 profiles 并生成 DNR 重定向规则。Popup/Options 页面使用 React + Vite。

本节是导航说明，不替代真实源码。涉及 Provider、stream、response mapping、profile schema 或 DNR 时，先用 CodeGraph 找当前入口，再读取源码确认。

## 数据流

1. 目标页面发出 XHR/fetch API 请求。
2. MV3 DNR 规则匹配用户配置的 origin、path、method 和资源类型。
3. 请求被重定向到 Bridge 的 `/proxy/:profileId`。
4. Bridge 校验 token、查找并 normalize profile。
5. Bridge 解析请求体、headers 和上下文，组装 prompt。
6. Provider 通过本地 CLI 或 custom command 生成 block、stream 或 normalized event。
7. Bridge 将输出映射为 OpenAI/SSE/custom JSON 响应。
8. 目标页面按原本协议消费响应。

## 模块边界

- Shared 不应依赖 Chrome API、Node HTTP 服务、DOM、React 或具体运行环境。
- Extension 不应直接执行本地命令；本地命令执行只能发生在 Bridge 或未来明确设计的 native host 中。
- Bridge 负责本地运行边界，包括鉴权、CORS、Provider 调用、诊断、错误响应和日志脱敏。
- UI 预览、Bridge 实际渲染和 shared 纯函数应尽量复用同一套 sanitizer、renderer、serializer 和 policy merge。

## 关键约定

- 环境变量同时支持 `PROXY2LOCALAI_*` 和旧版 `web2LocalAgent_*` 前缀，代码中统一处理兼容。
- Bridge 鉴权通过 `x-proxy2localai-token` header 或 `?token=` query 参数；新增 UI 和文档应优先引导 header。
- Provider 输出解析需要兼容 Claude Code、Codex CLI 和 custom command 的不稳定 JSON/stream-json 行为。
- 扩展的 Vite 配置和 vitest 配置使用 `@proxy2localai/shared` alias 指向 `packages/shared/src/index.ts`，开发时无需预编译 shared 包。
- 测试文件与源文件同目录，命名为 `*.test.ts`。

## 常用命令

```bash
# 构建
npm run build

# 开发模式
npm run dev:bridge
npm run dev:extension

# 启动 Bridge
npm run start:bridge

# 测试
npm test
npm run test:watch

# 类型检查
npm run typecheck

# 自检
npm run doctor

# 发布
npm run release
```

## 调试链路

排查代理问题时按链路分段验证：

1. 目标页面是否发出了预期请求。
2. DNR 规则是否匹配目标域名、路径、方法和资源类型。
3. 请求是否重定向到 Bridge 的 `/proxy/:profileId`。
4. Bridge 是否在线，token 是否正确。
5. profile 是否存在、启用并已同步到 Bridge。
6. 请求体和上下文是否被正确解析并组装为 prompt。
7. Provider CLI 是否在正确 cwd 启动，stdout/stderr 是否符合解析预期。
8. 响应是否按 block、SSE、自定义 JSON 或 mapped SSE 的配置返回。
9. 目标页面是否能消费该响应格式。

常见入口：Bridge health、doctor、最近请求诊断、浏览器 Network 面板、extension service worker 日志。

## UI/UX 基线

- UI 定位是克制的开发者工具控制台，不是营销页。
- 首次上手优先服务“粘贴 cURL -> 选择本地 AI -> 测试 -> 保存”的闭环。
- 基础配置、高级配置、专家配置分层展示，避免普通用户被高风险字段干扰。
- Popup 用于快速状态判断、同步和启停；Options 用于完整配置、诊断和高级能力。
- 错误信息应给出失败阶段、原因和下一步建议。
- 长 URL、长错误、长响应和日志内容必须可截断、可展开或可复制，不能撑破布局。

