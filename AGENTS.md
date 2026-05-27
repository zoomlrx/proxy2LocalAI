# AGENTS.md

本文件是本仓库的统一智能体协作说明。Claude、Codex 以及其他代码代理都应以本文为准；`CLAUDE.md` 仅保留跳转说明，避免多份规则长期漂移。

## 核心原则

→ 先想清楚再写代码
陈述假设，不确定就问，杜绝猜测。

→ 从最简方案入手
只写能解决问题的最少代码，不加无必要抽象。

→ 像手术一样精准修改
不碰与需求无关的代码，每行改动都对应明确要求。

→ 以目标驱动执行
写第一行代码前，把模糊指令转化为可验证的成功标准。

→ 默认中文协作
与用户沟通、文档说明、代码注释和评审结论默认使用中文。

## 项目概述

Proxy2LocalAI 是一个将浏览器 API 请求代理到本地 AI CLI 工具（Claude Code、Codex CLI 或自定义命令）的系统。由本地 Bridge 服务拦截匹配的 HTTP 请求，调用本地 AI provider 生成响应，再以 OpenAI 兼容格式返回。

## 架构

npm workspaces monorepo，三个包：

- **`packages/shared`** (`@proxy2localai/shared`) — 共享类型定义和纯函数：`ProxyProfile`、`AppConfig` 类型及校验归一化逻辑、OpenAI 兼容响应构造、prompt 组装、SSE 解析与自定义 JSON 模板渲染、配置文件导入导出。平台无关，tsup 编译为 ESM。
- **`apps/bridge`** (`@proxy2localai/bridge`) — Node.js HTTP 服务。核心文件 `server.ts` 处理所有路由：`/health`（无鉴权）、`/doctor`、`/admin/profiles`（CRUD）、`/proxy/:profileId`（代理转发）。`providers.ts` 通过 `child_process.spawn` 调用 CLI 命令，支持 block/stream/custom_json 三种响应模式。`doctor.ts` 提供自检报告。默认监听 `127.0.0.1:39399`。
- **`apps/extension`** (`@proxy2localai/extension`) — Chrome MV3 扩展。`background.ts` 为 service worker，监听扩展安装/启动/storage 变化后调用 `sync.ts` → `bridgeApi.ts`（同步 profiles 到 bridge）+ `dnr.ts`/`rules.ts`（生成 declarativeNetRequest 重定向规则，将匹配的 XHR 请求重定向到 bridge 的 `/proxy/:id` 端点）。Popup/Options 页面使用 React + Vite 构建。

数据流：浏览器 XHR → DNR 规则重定向到 Bridge → Bridge 匹配 profile → spawn AI CLI → 解析输出 → OpenAI 格式响应返回。

## 角色边界

- 如果用户要求“只设计”，只输出设计、需求、流程、验收标准，不进入编码实现。
- 如果用户要求“只评审”，先列问题和风险，再给简短总结；不要主动修改代码。
- 如果用户要求“修复问题”，必须先复现或定位证据，再做最小改动。
- 如果用户要求“实现计划”，按现有架构落地，不引入未经确认的大型重构。
- 如果需求不清，但可以安全推进，应先声明假设；如果假设会影响安全、数据或架构边界，应先问清楚。

## 修改纪律

- 不回滚用户未明确授权的改动。
- 不做与当前任务无关的重构、格式化或依赖升级。
- 修改前先阅读相关文件和现有模式，优先延续本仓库风格。
- 手工编辑优先使用 `apply_patch`；批量格式化或生成产物除外。
- 不使用 `git reset --hard`、`git checkout --` 等破坏性命令，除非用户明确要求。
- 不提交 `.env`、本地 token、真实请求样本、`apps/bridge/data/`、构建压缩包或本地调试产物。

## 模块责任

- `packages/shared`：只放平台无关的类型、schema、纯函数、协议 DTO、prompt 组装、响应模板和配置导入导出逻辑。
- `apps/bridge`：负责本地 HTTP 服务、鉴权、CORS、profile 管理、诊断、Provider 调用、OpenAI/SSE/自定义响应包装。
- `apps/extension`：负责 Chrome/Edge MV3 扩展、DNR 规则、storage、权限申请、popup/options UI、与 bridge 同步。
- Extension 不应直接执行本地命令；本地命令执行只能发生在 Bridge 或未来明确设计的 native host 中。
- Shared 不应依赖 Chrome API、Node HTTP 服务或具体 UI 框架。

## 常用命令

```bash
# 构建（必须先 shared，再 bridge/extension）
npm run build

# 开发模式
npm run dev:bridge        # tsx 运行 bridge
npm run dev:extension     # vite watch 模式构建扩展

# 启动 bridge（需先 build）
npm run start:bridge

# 测试
npm test                  # vitest run（扫描 packages/**/*.test.ts 和 apps/**/*.test.ts）
npm run test:watch        # vitest watch

# 类型检查
npm run typecheck

# 自检
npm run doctor

# 发布
npm run release
```

## 关键约定

- 环境变量同时支持 `PROXY2LOCALAI_*` 和旧版 `web2LocalAgent_*` 前缀，代码中统一处理兼容。
- Bridge 鉴权通过 `x-proxy2localai-token` header 或 `?token=` query 参数。
- Provider 输出解析：Claude CLI 使用 `--output-format json/stream-json`，Codex CLI 使用 `--json`。`providers.ts` 中 `extractTextFromProviderLine` 负责从 JSON 行中提取文本。
- 扩展的 Vite 配置和 vitest 配置都使用 `@proxy2localai/shared` alias 指向 `packages/shared/src/index.ts`，开发时无需预编译 shared 包。
- 测试文件与源文件同目录，命名为 `*.test.ts`。

## 安全边界

- Bridge 默认只能监听 `127.0.0.1`，不得默认暴露到局域网或公网。
- 不做真实线上接口自动回退，避免敏感请求在代理失败时误发远端。
- token、请求体、页面上下文、Provider stdout/stderr、诊断导出都要考虑脱敏。
- 高风险 CLI 参数必须由用户显式配置，不得默认开启。
- 请求体、当前页面上下文、headers 和 cookies 都可能包含敏感信息；新增日志或诊断功能时必须最小化采集。
- 新增 Provider 或 custom command 时，要防止参数注入、cwd 混淆和无意执行危险命令。

## MV3 扩展约束

- 不依赖 service worker 的长期内存状态；持久数据必须进入 `chrome.storage`。
- 网络拦截和重定向优先使用 `chrome.declarativeNetRequest`。
- Host 权限要最小化，优先按用户配置申请，不要扩大到全站权限。
- 扩展不能加载远程 JS/WASM，所有前端代码必须随扩展打包。
- 修改 DNR 规则、权限或 storage 同步逻辑时，要同时考虑安装、启动、配置变更和 Bridge 离线场景。

## UI/UX 准则

- UI 定位是“克制的开发者工具控制台”，不是营销页。
- 首次上手应优先服务“粘贴 cURL → 选择本地 AI → 测试 → 保存”的闭环。
- 基础配置、高级配置、专家配置要分层展示，避免普通用户被高风险字段干扰。
- Popup 用于快速状态判断、同步和启停；Options 用于完整配置、诊断和高级能力。
- 错误信息必须尽量给出失败阶段、原因和下一步建议。
- 可点击区域应使用语义按钮或提供等价键盘交互；保留清晰的 `focus-visible` 状态。
- 长 URL、长错误、长响应和日志内容必须可截断、可展开或可复制，不能撑破布局。
- 可以考虑 Tailwind，但 Tailwind 是实现设计系统的工具，不是重写业务逻辑的理由。

## 调试流程

排查代理问题时按链路分段验证：

1. 目标页面是否发出了预期请求。
2. DNR 规则是否匹配了目标域名、路径、方法和资源类型。
3. 请求是否重定向到 Bridge 的 `/proxy/:profileId`。
4. Bridge 是否在线，token 是否正确。
5. profile 是否存在、启用并已同步到 Bridge。
6. 请求体和上下文是否被正确解析并组装为 prompt。
7. Provider CLI 是否在正确 cwd 启动，stdout/stderr 是否符合解析预期。
8. 响应是否按 block、SSE、自定义 JSON 或映射 SSE 的配置返回。
9. 目标页面是否能消费该响应格式。

常见问题优先查看 Bridge health、doctor、最近请求诊断、浏览器 Network 面板和 extension service worker 日志。

## 验证策略

- 修改 `packages/shared`：运行相关单测，必要时运行 `npm run typecheck`。
- 修改 `apps/bridge`：运行 bridge/provider/diagnostics 相关测试，涉及协议时补充集成测试。
- 修改 `apps/extension`：运行 extension 相关测试和 `npm run typecheck`，涉及 UI 或 DNR 时尽量用浏览器验证。
- 修改跨包协议、profile schema、响应格式或构建配置：运行 `npm test`、`npm run typecheck`、`npm run build`。
- 只改文档时不强制跑测试，但最终说明应写明“未运行测试，原因是仅文档变更”。

## 文档维护

- 用户可见行为变化要同步 `README.md`。
- 安全边界、数据采集、日志和权限变化要同步 `SECURITY.md` 或 `PRIVACY.md`。
- 设计规划建议放在 `docs/plans/`；如果需要进入版本控制，注意当前 `.gitignore` 可能忽略该目录下文件。
- 当用户要求“输出设计方案”时，默认需要写入 Markdown 文件，优先放在 `docs/plans/YYYY-MM-DD-<topic>-design.md`，方便后续 AI 或开发者读取执行。
- `CLAUDE.md` 只保留指向本文件的说明，不再维护重复内容。
