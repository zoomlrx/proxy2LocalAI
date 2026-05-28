# AGENTS.md

本文件是本仓库的智能体入口规则。它只保留必须马上遵守的硬约束和知识路由；细节经验按需读取 `docs/knowledge/`。

## 不可违背

- 默认使用简体中文沟通、写文档、写注释和输出评审结论；代码、命令、API 名称和专有名词可保留原文。
- 最新用户指令优先于历史上下文；用户要求“只设计”“只评审”“只分析”时，不主动修改代码。
- 安全、隐私、敏感数据、破坏性 Git 操作和不回滚用户改动这些边界不能被普通实现需求覆盖。
- 需求不清但可以安全推进时，先声明假设；如果假设会影响安全、数据、架构边界或用户配置，先提问。
- 除非用户明确要求，不执行 `git commit`、`git push`。

## 项目概览

Proxy2LocalAI 是 Chrome/Edge MV3 扩展加本地 Node Bridge 服务，将用户显式配置的浏览器 API 请求代理到本地 AI CLI，例如 Claude Code、Codex CLI 或自定义命令。

- `packages/shared`：平台无关的类型、schema、协议 DTO、prompt 组装、响应模板、SSE/JSON 映射和配置导入导出。
- `apps/bridge`：本地 HTTP Bridge、鉴权、CORS、profile 管理、诊断、Provider 调用、OpenAI/SSE/自定义响应包装。
- `apps/extension`：MV3 扩展、DNR 规则、storage、权限申请、popup/options UI、与 Bridge 同步。

核心链路：浏览器请求 -> DNR 重定向 -> Bridge `/proxy/:profileId` -> 本地 Provider CLI -> 响应映射 -> 目标页面消费。

更完整的架构、命令和调试链路见 `docs/knowledge/project-map.md`。

## 修改纪律

- 修改前先阅读真实源码和现有模式，优先延续本仓库风格。
- 手工编辑优先使用 `apply_patch`；批量格式化或生成产物除外。
- 不做与当前任务无关的重构、格式化、依赖升级或文件移动。
- 不回滚用户未明确授权的改动；遇到已有未提交变更时，先判断是否与当前任务相关。
- 不使用 `git reset --hard`、`git checkout --` 等破坏性命令，除非用户明确要求。
- 不提交 `.env`、本地 token、真实请求样本、真实 profile 导出、`apps/bridge/data/`、构建压缩包或本地调试产物。

## 安全红线

- Bridge 默认只能监听 `127.0.0.1`，不得默认暴露到局域网或公网。
- 不做真实线上 API 自动回退，避免敏感请求在代理失败时误发远端。
- token、headers、cookies、请求体、页面上下文、prompt、Provider stdout/stderr、日志和诊断导出都必须最小化采集并考虑脱敏。
- 本地命令执行只能发生在 Bridge 或未来明确设计的 native host 中；custom command 必须避免 shell 字符串拼接。
- 高风险 CLI 参数、raw/data/tool input/tool output 暴露必须由用户显式开启，默认保守。
- 扩展不能加载远程 JS/WASM；Host 权限和 DNR 规则必须保持最小化。

## 知识库取用

按需主动读取知识库，避免把所有细节塞进本文件：

| 任务或风险 | 必读文档 |
| --- | --- |
| 理解架构、命令、调试链路、关键约定 | `docs/knowledge/project-map.md` |
| 需求评审、代码评审、发布前检查 | `docs/knowledge/review-checklists.md` |
| 需求、架构、跨模块实现或高风险改动 | `docs/knowledge/anti-patterns.md`、`docs/knowledge/engineering-lessons.md` |
| profile schema、配置导入导出、response template、Bridge API、SSE/JSON 响应映射 | 先读 `docs/knowledge/anti-patterns.md`，再读 `docs/knowledge/review-checklists.md` |
| Provider codec、本地 CLI、custom command、token、日志、诊断、敏感字段 | 先读 `docs/knowledge/anti-patterns.md`，再读 `docs/knowledge/engineering-lessons.md` |
| UI、DNR、MV3、CORS、权限、storage 同步 | `docs/knowledge/project-map.md`、`docs/knowledge/review-checklists.md` |

新增反模式写入 `docs/knowledge/anti-patterns.md`；新增正向做法写入 `docs/knowledge/engineering-lessons.md`。知识库只辅助决策，不能替代源码、Graphify、CodeGraph 和测试验证。

## Graphify / CodeGraph

- 涉及需求方案、业务概念、接口契约、配置、schema、文档、流程、跨模块关系时，优先使用 Graphify。
- 涉及编码、缺陷修复、重构、调用链、symbol、caller/callee、修改影响面时，优先使用 CodeGraph。
- 修改公共 API、schema、类型定义、共享模块或可复用逻辑时，必须检查所有消费者。
- 不要只凭图谱或摘要修改代码；任何修改前必须读取真实源码确认。

## 验证与交付

- 按风险域选择验证，而不是只按目录选择；具体矩阵见 `docs/knowledge/review-checklists.md`。
- 跨包协议、profile schema、响应格式、Provider 或构建配置改动，优先运行 `npm test`、`npm run typecheck`、`npm run build`。
- 只改文档时不强制跑测试，但最终说明应写明“未运行测试，原因是仅文档变更”。
- 用户可见行为变化同步 `README.md`；安全边界、数据采集、日志、权限变化同步 `SECURITY.md` 或 `PRIVACY.md`。
- 用户明确要求保存、沉淀或形成执行文档时，优先写入 `docs/plans/YYYY-MM-DD-<topic>-design.md`。
