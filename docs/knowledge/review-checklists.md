# Proxy2LocalAI 评审检查清单

> 用途：需求评审、代码评审、发布前检查和高风险变更验收。先读 `AGENTS.md`，再按任务读取本清单。

## 评审输出格式

评审时先列问题和风险，再给简短总结。每个问题尽量包含：

- 严重程度：阻断、重要、一般。
- 位置：文件、函数、配置项或用户路径。
- 风险：会导致什么错误、泄露、兼容问题或发布风险。
- 触发条件：什么配置、请求、Provider 输出或浏览器场景会触发。
- 建议：最小修复方向和需要补充的验证。

如果未发现问题，应说明已检查范围、未覆盖范围和剩余风险。用户明确排除的文件类型不得作为评审问题主体。

## 需求准入

以下情况不应进入开发：

- 不能说明目标用户、用户路径或成功标准。
- 涉及 token、日志、诊断、Provider stdout/stderr、raw/data/tool 内容，但没有隐私边界。
- 涉及 profile schema、Bridge API、响应协议或 DNR 权限，但没有兼容和迁移策略。
- 需要执行本地命令，但没有 command/args、cwd、环境变量、超时和错误处理边界。
- 需求依赖真实线上 API 自动回退或默认扩大浏览器权限。

## 合并准入

以下情况不应合并：

- UI 保存成功但 Bridge 实际运行路径未打通。
- shared schema、Options draft、extension storage、Bridge normalize、Provider 或 renderer 只有部分链路更新。
- 新增日志、diagnostics、preview 或 error payload 未检查脱敏。
- SSE/JSON 响应只做类型检查，没有 frame 级或协议语义验证。
- Provider 解析直接依赖某个 CLI 当前输出结构，且没有未知事件和错误路径处理。
- 修改跨包契约后没有检查所有消费者。

## 发布准入

以下情况不应发布：

- `npm test`、`npm run typecheck`、`npm run build` 中任一必要验证失败且没有明确豁免说明。
- Bridge 默认监听范围、DNR 权限、token 处理、日志采集或诊断导出发生变化但未同步安全文档。
- 用户可见行为、配置方式、Provider 支持、响应协议或错误信息变化但未同步 README 或迁移说明。
- release 包含本地数据、真实 token、真实请求样本、构建临时文件或调试产物。

## 风险域检查

### profile schema / 配置模型

- 字段是否经过 `ProxyProfile`、默认值、`normalizeProfile`、导入导出、Options draft、Bridge 同步。
- 旧配置是否能加载，新配置是否能保存和导出。
- 模板切换是否清理隐藏高风险字段。
- UI 预览和 Bridge 实际运行是否使用一致的 shared 逻辑。

最低验证：相关单测、旧配置样本、新配置保存、导入导出、Bridge profile 同步。

### Bridge API / 响应协议

- block、stream、custom JSON、mapped SSE 是否都有明确行为。
- error、done、empty output、invalid JSON、Provider timeout 是否符合目标协议。
- OpenAI/SSE/custom JSON 的字段名、event 名、`data:` 编码和 `[DONE]` 是否有断言。
- CORS 和 `OPTIONS` preflight 是否被覆盖。

最低验证：协议单测、SSE frame 级断言、错误路径测试、必要时运行 `npm test`、`npm run typecheck`、`npm run build`。

### Provider / 本地 CLI

- command 和 args 是否分离，是否避免 shell 拼接。
- cwd、环境变量、超时、退出码、stderr 和大输出是否可控。
- Claude Code、Codex CLI 或 custom command 的未知事件是否走安全摘要路径。
- block 文本、stream 文本、mapped SSE 是否来自统一中间事件或统一抽取规则。

最低验证：Provider 单测、stdout/stderr 样本、非零退出、timeout、未知事件。

### 安全、token、日志、诊断

- token 是否可能出现在 URL 回显、日志、错误响应、diagnostics、Network 面板说明或导出文件中。
- headers、cookies、请求体、页面上下文、prompt、tool input/output、raw/data 是否默认不完整保存。
- diagnostics 是否按阶段记录摘要，而不是保存原始大包。
- 高风险能力是否由用户显式开启，并能恢复安全默认。

最低验证：脱敏测试、日志样本检查、diagnostics 导出检查、`SECURITY.md` 或 `PRIVACY.md` 同步。

### MV3 / DNR / Extension

- DNR 是否匹配 origin、path、method、resourceTypes，而不是只看 URL。
- 安装、启动、storage 变化、profile 禁用、Bridge 离线后是否能恢复或给出可诊断状态。
- service worker 是否不依赖长期内存状态。
- Host 权限是否最小化，是否避免加载远程 JS/WASM。

最低验证：规则生成测试、storage 同步测试、popup/options 状态验证，涉及 UI 时尽量用浏览器手动验证。

### UI / 交互

- 是否符合 `docs/design/ui-ux-guidelines.md` 的深色控制台 token、三栏信息架构、响应式和可访问性要求。
- 用户是否能完成“粘贴 cURL -> 选择本地 AI -> 测试 -> 保存”的主要路径。
- 高风险专家字段是否被分层展示，并有明确确认或恢复默认方式。
- 错误是否包含失败阶段、原因和下一步建议。
- 长 URL、长 JSON、长错误和日志是否不会撑破布局。
- Options、Popup、抽屉、弹窗是否都能在窄屏使用，表格是否以横向滚动承载长字段。
- 诊断和日志是否默认脱敏，raw/data/tool input/tool output 是否需要显式高风险开关。

最低验证：相关 UI 单测或渲染测试、关键路径手动检查、长文本样本。

## 文档同步

- 用户可见行为变化：同步 `README.md`。
- 安全边界、数据采集、日志、权限变化：同步 `SECURITY.md` 或 `PRIVACY.md`。
- 设计规划和阶段拆分：需要沉淀时写入 `docs/plans/`。
- 反复出现的问题：写入 `docs/knowledge/anti-patterns.md`。
- 可复用做法：写入 `docs/knowledge/engineering-lessons.md`。
