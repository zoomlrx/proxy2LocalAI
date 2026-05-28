# Proxy2LocalAI 反模式知识库

> 提取时间：2026-05-28
> 提取依据：当前源码、Graphify 图谱报告、CodeGraph 索引结构、近期协议与流式映射评审结论。

本文记录本项目中最容易反复出现的反模式。做需求评审、代码评审或实现前，先用它排查“看起来能跑，但会在真实代理链路里出问题”的设计。

## 1. 只改配置字段，不打通真实运行路径

**表现**

- 新增 profile 字段、UI 下拉框或模板字段后，只在 `packages/shared` 或 Options UI 中可见。
- Bridge 仍走旧响应路径，或 Provider 仍按旧输出解析。
- 字段名看起来表达了能力，但运行时没有使用，或只在部分 response mode 下使用。

**为什么危险**

Proxy2LocalAI 的一个能力通常跨越 `profile schema → Options draft → extension storage → bridge normalize → request routing → provider → response renderer`。只改其中一段，会造成 UI 与真实行为不一致，用户会以为已经配置成功，但目标页面收到的格式仍然不对。

**规避检查**

- 搜索字段在 `ProxyProfile`、`ProfileDraft`、`normalizeProfile`、`profileToDraft`、`draftToProfile`、配置导入导出、模板应用、Bridge 分支里的使用点。
- 对响应协议字段，必须同时检查 block、stream、custom_json、mapped_sse 的行为边界。
- 对 schema 改动，至少验证旧配置加载、新配置保存、导入导出、Bridge 同步四条路径。

## 2. 用字段前缀、id 命名或隐式约定当功能开关

**表现**

- 通过 `id` 前缀、字段是否为空、字符串命名习惯来判断该走旧逻辑还是新逻辑。
- 用户编辑了 JSON 配置，但因为没有改某个隐藏命名约定，运行时仍走旧分支。

**为什么危险**

专家配置通常直接暴露 JSON。用户只改 `emit.data`、done event 或安全策略时，不一定知道还要改 `id`。隐式开关会让“看起来保存成功”的配置在 Bridge 中被忽略。

**规避检查**

- 模式切换应使用显式字段、结构等价判断或迁移标记，而不是依赖展示用 id。
- 兼容旧逻辑时，要写清“什么是完全未修改的 legacy 配置”。
- UI 预览、保存后 profile、Bridge 分支选择必须使用同一套判断。

## 3. 脱敏只处理显眼字段，忽略 `raw`、`data` 和诊断旁路

**表现**

- tool policy 只删除 `tool.input` 或 `tool.output`。
- renderer policy 又允许 `{{data}}`、`{{raw}}`、诊断 payload 或 provider 原始事件进入 SSE。
- 日志和诊断导出在最后一步才脱敏，前面已经持久化了原文。

**为什么危险**

本项目代理浏览器请求并执行本地 CLI，敏感信息可能在 headers、body、page context、Provider stdout/stderr、tool input/output、raw event 中重复出现。只清理一个字段会留下旁路泄露。

**规避检查**

- 先生成用于映射和日志的 sanitized event，再进入 renderer 和持久化。
- 默认禁止 raw/data/tool input/tool output，除非用户显式打开。
- debug/status/error/raw/lifecycle 事件默认只保留摘要，不保留完整 payload。
- 新增日志、doctor、diagnostics、preview 时必须先问：这里会不会写入 token、cookie、prompt、页面上下文或本地路径。

## 4. 为协议适配覆盖原始请求体

**表现**

- 把 Anthropic、OpenAI、Gemini 请求统一抽成 `messages` 后，直接替换原始 body。
- prompt 组装只能看到文本消息，看不到 `tools`、`tool_choice`、`max_tokens`、`metadata`、`temperature` 等上下文。

**为什么危险**

本地 CLI 需要的是完整意图，不只是消息文本。目标接口的协议字段可能决定工具调用、流式偏好、模型选择和安全行为。丢失原始 body 会让生成效果和真实 API 行为偏离。

**规避检查**

- 路由转换应保留 `originalBody` 或等价原始上下文。
- prompt 组装要明确使用“抽取消息”和“原始协议字段”的边界。
- 对默认原生协议，不要做不必要的请求改写。

## 5. UI 预览和 Bridge 实际渲染不是同一套逻辑

**表现**

- Options 中 preview 用简化 renderer，Bridge 用另一套 security policy、done policy、sanitizer。
- UI 显示会输出某个 SSE frame，真实代理时被 drop、报错或泄露字段。

**为什么危险**

stream mapping 是专家能力，用户主要依赖预览来判断配置是否安全可用。如果 preview 与运行时不同，错误会延后到真实目标页面才暴露。

**规避检查**

- preview 必须复用 shared 层纯函数：sanitize、render、serialize、policy merge。
- preview 的默认策略应和 Bridge 默认策略一致。
- 对危险变量展示明确错误，而不是静默生成看似可用的 frame。

## 6. 把 Claude Code / Codex CLI 输出当成稳定协议

**表现**

- 直接在 Provider 主流程里解析具体 JSON 行结构。
- 新增 CLI 字段时改动散落在 block、stream、mapped_sse 多处。
- 遇到未知事件时直接丢弃，或把所有未知事件当 message。

**为什么危险**

本地 AI CLI 的 JSON/stream-json 行为会变，且不同版本可能输出 `stream_event`、`assistant`、`result`、tool、approval、status、error 等多类事件。解析和业务响应混在一起会放大变更成本。

**规避检查**

- 每个 Provider 使用独立 codec，把 CLI 输出先转成 `NormalizedStreamEvent`。
- 未知事件走 raw/debug/status 摘要路径，不要默认泄露完整原文。
- block 文本、stream 文本、mapped SSE 都从统一中间事件或统一文本抽取规则派生。

## 7. 新旧 SSE 路径混用但没有兼容边界

**表现**

- 旧 `sseEventMappings` 和新 `streamMappings` 同时存在。
- 旧路径和新路径的 JSON stringify 规则、done event 规则、错误策略不一致。
- 模板同时写 legacy 字段和 V2 字段，但没有定义谁优先。

**为什么危险**

目标网页通常严格消费 SSE 格式。一次不兼容的 frame 变化就可能导致页面流式解析失败，而测试只看到了 Bridge 有输出。

**规避检查**

- 明确 legacy 与 V2 的启用条件。
- 迁移函数必须可逆到合理程度，并说明丢失哪些信息。
- 对 event 名、data 编码、多行 data、done/error 策略做协议级测试。

## 8. 模板切换保留隐藏高风险字段

**表现**

- 从包含 tool/raw/data 权限的模板切换到普通模板时，只覆盖部分字段。
- 旧的 `toolEventPolicy`、`mappingSecurityPolicy`、`streamDonePolicy` 或 codec 仍留在 draft/profile 中。

**为什么危险**

用户看到的是普通模板，但实际运行仍可能允许工具输入输出或 raw/data 进入响应。安全状态和界面认知发生偏移。

**规避检查**

- 应定义模板应用策略：全量替换、局部补丁、还是保留用户编辑。
- 从高权限模板切到低权限模板时，默认清理高风险策略，或给出明确确认。
- 模板字段的“缺省”不能等同于“保持旧值”，除非 UI 明确说明。

## 9. DNR 只验证 URL 命中，不验证整条浏览器链路

**表现**

- 只看 `regexFilter` 是否匹配目标 URL。
- 没有验证 method、resourceTypes、query token、CORS preflight、Bridge 离线、配置变更同步。

**为什么危险**

MV3 DNR 是浏览器层拦截，错一项就可能表现为“目标页面没有任何响应”。同时 token 放在 query 中，日志和 Network 面板也要考虑暴露范围。

**规避检查**

- DNR 改动要覆盖安装、启动、storage 变化、profile 禁用、Bridge 离线。
- 保持 host 权限最小化，只为用户配置的目标申请。
- Bridge 端读取 query token 后，日志和 request parameters 不应保留 token。

## 10. 本地命令执行能力缺少边界

**表现**

- custom command 和 provider args 直接拼接 shell 字符串。
- 默认打开危险 CLI 参数。
- cwd、环境变量、超时和退出码处理不清晰。

**为什么危险**

Bridge 是本地命令执行边界。浏览器请求、页面上下文和 prompt 都可能受外部影响，任何参数注入或 cwd 混淆都可能变成本机风险。

**规避检查**

- 使用 `spawn(command, args, { shell: false })` 风格，避免 shell 拼接。
- 危险参数必须用户显式开启。
- 日志只记录命令摘要、退出码、耗时和字符数，不记录完整敏感 stdout/stderr。

## 11. 依赖 MV3 service worker 长期内存状态

**表现**

- 把 profile、token、同步状态或最近错误只放在 background 内存变量。
- 没有处理 service worker 被浏览器回收后的恢复。

**为什么危险**

MV3 service worker 生命周期不稳定。扩展恢复后状态丢失，会导致 DNR 未同步、popup 状态错误或 Bridge 配置落后。

**规避检查**

- 持久状态进入 `chrome.storage`。
- 安装、启动、storage 变化都应触发同步。
- popup 和 options 不应假设 background 内存已经准备好。

## 12. 只跑类型检查，不跑真实协议验证

**表现**

- schema、响应协议、SSE 映射、DNR 或 Provider codec 改动只跑 `typecheck`。
- 没有构造真实 JSON/SSE 样本验证目标页面能消费。

**为什么危险**

协议错误通常是“类型正确、语义错误”。例如 SSE `data:` 编码、done event、OpenAI/Anthropic/Gemini 字段命名都可能通过类型检查但运行失败。

**规避检查**

- 跨协议改动至少运行 `npm test`、`npm run typecheck`、`npm run build`。
- 对 SSE 增加 frame 级断言，对 response mode 增加端到端行为断言。
- UI 改动要验证长 URL、长错误、长 JSON 不撑破布局。
