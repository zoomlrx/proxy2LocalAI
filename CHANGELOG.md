# 变更日志

本项目遵循语义化版本思路记录重要变更。`0.x` 阶段 API 和配置格式仍可能调整。

## 0.1.0 - 2026-05-22

### 新增

- Chrome/Edge MV3 扩展，用于配置指定 API 请求代理规则。
- 本地 Bridge 服务，支持 OpenAI 兼容 JSON、SSE 和自定义 JSON 响应。
- Claude Code、Codex 和 Custom Provider。
- 配置导入导出、Bridge 自检、请求日志和 demo 聊天测试页。

### 安全

- Bridge 默认只监听 `127.0.0.1`。
- 管理接口和代理入口通过本地 token 鉴权。
- 分享模板默认移除 token，并停用 profile。
