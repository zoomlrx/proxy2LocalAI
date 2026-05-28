# Proxy2LocalAI 项目角色智能体

本文记录本项目已配置的角色智能体，方便在 Codex 和 Claude Code 中按角色分派任务。

## 结论

- Codex 使用 `.codex/agents/*.toml`。
- Claude Code 使用 `.claude/agents/*.md`。
- 两者没有可直接共用的同一个 agent 文件目录，因为文件格式和字段不同。
- 本项目采用“双入口、同语义”的方式维护角色：Codex 和 Claude Code 各有一套可执行入口，角色职责保持一致。

## 生效说明

- Codex 当前支持真正的 subagent 运行时；本项目角色放在项目级 `.codex/agents/`。
- 如果当前已打开的 Codex 会话没有看到新角色，重新进入项目会话或刷新工具注册后再调用。
- Claude Code 直接在磁盘新增或修改 `.claude/agents/*.md` 后，通常需要重启当前 Claude Code 会话才会加载；通过内置 `/agents` 界面创建的角色可立即生效。
- Claude Code 的项目角色可用 `@agent-<name>` 点名，也可用 `claude --agent <name>` 启动指定角色会话。

## 角色记忆

角色记忆放在 `docs/agents/memory/`，Codex 和 Claude Code 共用同一套项目记忆：

| 记忆文件 | 对应角色 |
| --- | --- |
| `docs/agents/memory/shared.md` | 所有角色 |
| `docs/agents/memory/chief-designer.md` | 总设计 |
| `docs/agents/memory/review-board.md` | 评审者团队 |
| `docs/agents/memory/requirements-owner.md` | 需求者 |
| `docs/agents/memory/ui-ux-designer.md` | UI/UX 设计者 |
| `docs/agents/memory/bug-fixer.md` | 修复者 |
| `docs/agents/memory/open-source-steward.md` | 开源者 |

角色启动时应先读 `shared.md`，再读自己的记忆文件。只把长期可复用的项目事实、设计决策、经验和待确认事项写入记忆；敏感、本地、临时内容放入被忽略的 `docs/agents/memory/local/` 或工具自己的 local memory。

## 角色禁止事项摘要

| 角色 | 不能做的事项 |
| --- | --- |
| 总设计 | 不直接实现业务代码，不绕过评审者团队为高风险方案背书，不把未确认假设写成事实，不放宽安全边界 |
| 评审者团队 | 不修改文件，不把风格偏好当阻断问题，不无证据下结论，不用大重构替代最小修复，不暴露敏感原文 |
| 需求者 | 不实现代码，不把猜测写成需求，不静默扩大范围，不省略安全、兼容、迁移和验证要求 |
| UI/UX 设计者 | 不约束未来模块，不实现业务或协议逻辑，不用营销式视觉替代工具效率，不隐藏必要安全和错误信息 |
| 修复者 | 不做无关重构，不吞错或放宽安全边界，不随意改公共协议，不回滚用户改动，不把敏感样本写入仓库 |
| 开源者 | 不发布或推送，不修改业务行为适配文档，不添加未经确认的法律或安全承诺，不纳入敏感和本地产物 |

## 角色索引

| 角色 | Codex 名称 | Claude Code 名称 | 适用任务 |
| --- | --- | --- | --- |
| 总设计 | `chief_designer` | `chief-designer` | 全局方案、架构边界、产品方向、设计文档、跨角色调度 |
| 评审者团队 | `review_board` | `review-board` | 方案评审、代码评审、安全评审、测试评审、发布风险 |
| 需求者 | `requirements_owner` | `requirements-owner` | 需求拆解、验收标准、实施阶段、非目标和兼容策略 |
| UI/UX 设计者 | `ui_ux_designer` | `ui-ux-designer` | 界面结构、交互流程、信息层级、可用性规范 |
| 修复者 | `bug_fixer` | `bug-fixer` | 缺陷复现、根因定位、最小修复、验证说明 |
| 开源者 | `open_source_steward` | `open-source-steward` | README、贡献指南、安全隐私文档、发布检查、社区治理 |

## Codex 使用方式

可以在 Codex 中直接点名角色，例如：

```text
请让 chief_designer 评估这个方案的架构边界。
请让 review_board 评审当前分支的风险。
请让 requirements_owner 把这份设计文档拆成可开发需求。
请让 ui_ux_designer 审查 Options 页面配置体验。
请让 bug_fixer 修复这个 CORS 问题并验证。
请让 open_source_steward 检查开源发布前还缺什么。
```

需要并行评审时，可以要求 Codex 分派多个角色并汇总：

```text
请分派 review_board、ui_ux_designer 和 open_source_steward 分别评审这次改动，等待全部结果后汇总阻断项。
```

## Claude Code 使用方式

Claude Code 支持通过 `@agent-<name>` 明确调用项目 subagent，例如：

```text
@agent-chief-designer 评估这个方案是否符合项目方向。
@agent-review-board 审查当前改动。
@agent-requirements-owner 把这份文档整理成可执行需求。
@agent-ui-ux-designer 设计配置侧栏的简化方案。
@agent-bug-fixer 修复当前失败用例。
@agent-open-source-steward 检查发布文档和开源风险。
```

也可以在 Claude Code 中使用 `--agent` 启动指定角色会话，例如：

```bash
claude --agent review-board
```

## 维护规则

- 修改一个角色时，同步更新 `.codex/agents/` 和 `.claude/agents/` 中对应文件。
- 修改角色名称或职责时，同步更新本文档。
- 角色提示词必须遵守 `AGENTS.md` 的语言、安全、Git 和交付要求。
- 评审类角色默认只读；修复者可以修改代码；设计、需求、UI 和开源角色默认只写文档，除非用户明确授权修改代码。
- Claude Code 的 `memory: local` 只表示工具侧本地运行记忆；项目内可共享、可评审的角色记忆以 `docs/agents/memory/` 为准。
