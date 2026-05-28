# Proxy2LocalAI 工程经验知识库

> 提取时间：2026-05-28
> 提取依据：当前源码、Graphify 图谱报告、CodeGraph 索引结构、近期协议与流式映射评审结论。

本文记录当前项目中值得复用的工程经验。做新需求、修复缺陷或评审方案时，用它帮助把设计落到稳定、安全、可验证的实现。

## 1. 把 `normalizeProfile` 当作配置契约入口

`ProxyProfile` 是 Extension、Bridge、配置导入导出和模板系统共享的契约。新增字段时，最佳路径是先定义类型和默认值，再在 `normalizeProfile` 中完成兼容、校验和克隆。

**可复用做法**

- 所有外部输入先进入 normalize，再进入运行时。
- 数组、策略对象、done event 等默认值使用 clone，避免共享引用被修改。
- 旧字段迁移到新字段时保留 legacy 字段，直到 Bridge 和 UI 都有明确兼容路径。

**适用场景**

- profile schema 改动。
- 配置导入导出。
- response template 新字段。
- Bridge admin profile 同步。

## 2. 用中间事件模型隔离 Provider 不稳定性

Claude Code、Codex CLI 和 custom command 的输出不应直接驱动 SSE renderer。先把 Provider 输出转成 `NormalizedStreamEvent`，再由 response mode 决定如何消费，是更稳的分层。

**可复用做法**

- Provider codec 只负责识别 CLI 行格式和生成标准事件。
- Bridge response 只消费 normalized event 或 legacy adapter。
- 未知事件保留为 debug/raw 摘要，既方便诊断，又避免泄露完整 payload。

**适用场景**

- 新增 Provider。
- 适配 Claude/Codex CLI 新版本。
- 增加 tool approval、tool result、reasoning、usage、error 事件。

## 3. 协议适配要同时覆盖请求、响应和流式事件

消息返回结构不是单纯的 response JSON 字段。它至少涉及请求抽取、prompt 上下文、block 响应、stream 响应和错误响应。

**可复用做法**

- 请求侧：抽取 messages 时保留 `originalBody` 或等价原始上下文。
- 响应侧：每种协议都有 block 和 stream 的构造函数。
- 错误侧：流式错误也要符合目标协议的消费习惯。
- UI 侧：选项文案明确说明是否需要路由转换。

**适用场景**

- Anthropic Messages、OpenAI Chat Completions、OpenAI Responses、Gemini generateContent。
- 新增 response mode。
- 目标页面消费格式变化。

## 4. 安全默认值要保守，例外必须显式

本项目处理浏览器请求和本地命令执行，默认策略应偏向“不泄露、不执行、不回退”。高风险能力可以存在，但必须由用户显式开启。

**可复用做法**

- 默认不允许 raw/data/tool input/tool output 进入映射。
- 默认不把 Bridge 暴露到局域网或公网。
- 默认不做真实线上 API 回退。
- 默认不启用危险 CLI 参数。
- 默认日志只记阶段、耗时、字符数和摘要。

**适用场景**

- mappingSecurityPolicy、toolEventPolicy。
- Provider stdout/stderr 日志。
- diagnostics 导出。
- custom command 和 provider args。

## 5. UI 预览应复用 shared 纯函数

Options UI 中的预览不是装饰功能，而是专家配置的第一道验证。预览越接近 Bridge 真实执行，用户越能在保存前发现问题。

**可复用做法**

- 预览使用 shared 的 sanitizer、renderer、serializer 和 policy merge。
- UI 只负责输入、展示和错误呈现，不重写协议逻辑。
- 预览错误显示具体变量、event 名或 JSON 字段问题。

**适用场景**

- streamMappings 预览。
- custom JSON template 预览。
- response template 推荐和应用。

## 6. 新旧能力共存时，先定义兼容边界

Proxy2LocalAI 已有 legacy SSE mapping，又加入了 normalized stream mapping。类似变更不能只靠“尽量兼容”，需要明确旧配置何时走旧路径，新配置何时走新路径。

**可复用做法**

- 对旧配置做结构等价判断，而不是依赖命名。
- 迁移函数只做可解释的转换，并保留丢失信息的边界。
- 默认旧用户不破坏，新用户配置能生效。

**适用场景**

- `sseEventMappings` 到 `streamMappings`。
- response template 演进。
- profile schema 版本迁移。

## 7. 诊断按阶段记录，比保存原始大包更安全

代理链路长，诊断必须能定位阶段，但不能为了定位问题而保存完整敏感数据。

**可复用做法**

- 用 `request_start → profile_match → body_parse → provider_start → first_chunk → done/error` 这类阶段记录。
- 每条阶段记录控制字段规模，只保留摘要。
- 导出时再次脱敏，但不能依赖导出脱敏作为唯一防线。

**适用场景**

- 最近请求面板。
- doctor 自检。
- request log。
- Provider 运行事件。

## 8. DNR 规则要和 Bridge 参数处理成对设计

扩展负责把目标请求重定向到 Bridge，Bridge 负责鉴权、去除 token 和还原目标上下文。两侧要作为一个整体验证。

**可复用做法**

- DNR 只匹配用户显式配置的 origin、path、method 和资源类型。
- token 可用于本地鉴权，但进入 Bridge 后应从业务 query 中剔除。
- CORS preflight、OPTIONS、Bridge 离线和配置同步要作为链路的一部分。

**适用场景**

- 修改 `rules.ts`、`dnr.ts`、`sync.ts`。
- Bridge token 或 CORS 改动。
- 新增资源类型或请求方法支持。

## 9. Prompt 组装要保留“用户意图”和“协议事实”

本地 CLI 最终看到的是 prompt。prompt 既要表达页面请求里的用户意图，也要保留目标协议事实，避免本地模型误解任务。

**可复用做法**

- 抽取 message 内容用于清晰表达对话。
- 保留原始 body 摘要，包含工具、模型、stream、参数等非文本字段。
- conversation memory 只保留必要轮次，避免隐私和上下文膨胀。

**适用场景**

- `extractPromptContext`、`composePrompt`。
- 协议转换。
- 多轮对话记忆。

## 10. Provider 执行边界要小而可观测

Bridge 调用本地 CLI 是风险最高的运行边界。好的实现应做到参数明确、环境收敛、超时可控、失败可诊断。

**可复用做法**

- 命令和参数分离传给 `spawn`。
- 清理会影响 CLI 行为的环境变量。
- 记录 start、stdout/stderr 字符数、exit code、timeout，不默认保存完整内容。
- 对 block、stream、event stream 使用同一组 Provider 基础能力。

**适用场景**

- `providers.ts`。
- 新增 custom provider。
- CLI 参数和 cwd 改动。

## 11. 发布前按风险域验证，而不是按文件夹验证

这个项目的风险不是只按包划分，而是按链路划分。一个 shared 字段可能影响 Bridge、Extension、README 和 SECURITY。

**可复用做法**

- schema 或协议改动：`npm test`、`npm run typecheck`、`npm run build`。
- UI 或 DNR 改动：补充浏览器侧验证。
- 安全、日志、token、敏感字段改动：同步 `SECURITY.md` 或 `PRIVACY.md`。
- 用户可见行为改动：同步 `README.md`。

**适用场景**

- release 前检查。
- PR review。
- 需求拆分。

## 12. Graphify 和 CodeGraph 的分工要固定下来

图谱工具对这个项目有价值，但不能替代源码阅读。

**可复用做法**

- Graphify 用于识别概念关系、文档关系、跨模块知识缺口。
- CodeGraph 用于定位 symbol、调用链、影响面和高连接函数。
- 高连接点如 `normalizeProfile`、`handleRequest`、`mappedSseResponse`、Provider codec 改动前必须读源码。

**适用场景**

- 需求评审。
- 架构设计。
- 代码评审。
- 跨模块重构。

## 13. 专家能力要有“可恢复的安全默认”

stream mapping、custom JSON、custom command 都属于专家能力。专家能力可以灵活，但必须允许用户回到安全默认。

**可复用做法**

- 提供内置模板，并说明模板影响哪些字段。
- 高风险策略字段清空时回到保守默认。
- 导入配置后先 normalize，再展示给用户确认。

**适用场景**

- ResponseTemplatePicker。
- ProfileEditor 专家配置。
- 配置导入导出。
