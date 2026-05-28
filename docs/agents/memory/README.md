# 角色记忆说明

本目录是 Proxy2LocalAI 的项目级角色记忆，用于让 Codex 和 Claude Code 的角色智能体共享长期事实、设计决策、经验和待确认事项。

## 文件结构

| 文件 | 用途 |
| --- | --- |
| `shared.md` | 所有角色都应读取的公共记忆 |
| `chief-designer.md` | 总设计记忆 |
| `review-board.md` | 评审者团队记忆 |
| `requirements-owner.md` | 需求者记忆 |
| `ui-ux-designer.md` | UI/UX 设计者记忆 |
| `bug-fixer.md` | 修复者记忆 |
| `open-source-steward.md` | 开源者记忆 |
| `local/` | 本地临时记忆，已被 `.gitignore` 忽略 |

## 使用规则

- 角色启动时先读 `shared.md`，再读自己的角色记忆。
- 只记录长期可复用的项目事实、设计决策、经验、反模式和待确认事项。
- 不记录 token、cookie、真实请求、真实响应、完整 prompt、Provider 原始输出、本地私有路径、用户隐私和临时日志。
- 不把任务过程流水账写入记忆；只沉淀未来会反复使用的结论。
- 修改记忆时优先追加短条目，必要时再整理归类。

## 与工具内置记忆的关系

Codex 和 Claude Code 的内置记忆机制可能各自独立。本目录是项目可见、跨工具共享的显式记忆层；工具自己的 local memory 只能作为补充，不能替代这里的项目记忆。
