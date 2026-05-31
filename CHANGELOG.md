# 变更日志

本项目遵循语义化版本思路记录重要变更。`0.x` 阶段 API 和配置格式仍可能调整。

## 0.2.0 - 2026-06-01

### 新增

- Profile 编辑器 UI：字段配置、cURL 解析、并排检查器组件。
- 请求诊断面板和 Profile 管理 UI 组件。
- Popup 界面、Profile 管理、Bridge 连接工具。
- 扩展 UI 脚手架、设计规范和测试数据。
- AI Provider 抽象层，支持 Claude 和 Codex 流式处理。
- Profile 管理、流事件处理和 Bridge 服务基础设施。
- 核心代理配置管理和 Bridge 通信基础设施。
- 多智能体基础设施脚手架、核心配置和文档模板。
- 综合单元和集成测试套件（providers、server、core）。

### 变更

- 更新扩展 UI 设计。

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
