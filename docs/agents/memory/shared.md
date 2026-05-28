# 共享记忆

## 项目事实

- Proxy2LocalAI 是 Chrome/Edge MV3 扩展加本地 Node Bridge 服务，用于把用户显式配置的浏览器 API 请求代理到本地 Claude Code、Codex CLI 或自定义命令。
- 核心链路是：浏览器请求 -> DNR 重定向 -> Bridge `/proxy/:profileId` -> 本地 Provider CLI -> 响应映射 -> 目标页面消费。
- 项目采用 npm workspaces，主要模块为 `apps/extension`、`apps/bridge`、`packages/shared`。

## 用户偏好

- 默认使用简体中文沟通和写文档。
- 用户说“输出设计方案”时，默认写入 Markdown 文件，优先放在 `docs/plans/YYYY-MM-DD-<topic>-design.md`。
- 用户要求“建议”尽量输出为 `markdown` 代码块，方便复制。
- 除非用户明确要求，不执行 `git commit` 或 `git push`。

## 长期边界

- Bridge 默认只能监听 `127.0.0.1`。
- 不做真实线上 API 自动回退。
- 扩展不能执行本地命令，本地命令执行只应发生在 Bridge 或未来明确设计的 native host。
- raw/data/tool input/tool output、日志、诊断和 Provider stdout/stderr 默认保守处理。

## 记忆写入规则

- 可写入：稳定设计决策、评审结论、反复出现的问题、验证经验、角色协作规则。
- 不写入：token、cookie、真实请求体、真实响应、用户隐私、本地临时日志、未脱敏 Provider 输出。
