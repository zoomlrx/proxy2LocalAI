# Proxy2LocalAI UI/UX 规范

版本：2026-05-31

## 设计定位

Proxy2LocalAI 的界面定位是“开发者本地 AI 代理控制台”。主路径服务于：

1. 粘贴 cURL 或填写目标请求。
2. 选择本地 Provider。
3. 测试 Bridge / Provider。
4. 保存 Profile。
5. 通过 Popup 或诊断台观察代理结果。

原型中的 Ollama、LM Studio、vLLM、模型池、外部网络搜索、Webhook 等能力只可作为未来导航或占位，不应在当前 UI 中伪装成已支持功能。任何新增 UI 字段必须能映射到现有 profile schema、Bridge API 或明确的只读诊断数据。

## 视觉系统

### 色彩 Token

```css
:root {
  --bg: oklch(16.2% 0.022 257.9);
  --surface: oklch(21.2% 0.033 267.8);
  --surface-2: oklch(23.2% 0.029 266.3);
  --surface-3: oklch(18.6% 0.032 264);
  --fg: oklch(95.4% 0.022 254.4);
  --muted: oklch(75.8% 0.037 269.8);
  --border: oklch(28.8% 0.038 269.1);
  --primary: oklch(81.1% 0.146 217.7);
  --accent: oklch(71% 0.247 341);
  --purple: oklch(60.5% 0.219 292.4);
  --success: oklch(72.3% 0.192 149.6);
  --warning: oklch(76.9% 0.165 70.1);
  --danger: oklch(67.2% 0.216 22.3);
}
```

语义约束：

- `primary` 用于主操作、焦点、选中态和可点击强调。
- `accent` 与 `purple` 只作为 Synthwave 主题点缀，不表达危险。
- `warning` 表示高风险待确认；`danger` 表示失败、删除、阻断错误。
- 不使用纯黑主背景；不在表格和正文区域使用大面积发光。
- 高风险能力独立分组，不能只靠颜色表达风险。

### 字体

- Display：`Orbitron`, `Rajdhani`, `Eurostile`, `Segoe UI`, system-ui, sans-serif。
- Body：`Inter`, `Segoe UI`, system-ui, sans-serif。
- Mono：`JetBrains Mono`, `IBM Plex Mono`, `Cascadia Mono`, ui-monospace, monospace。

## 信息架构

Options 默认为三栏控制台：

- 顶部：品牌、Bridge 状态、版本、最近失败、最近诊断、Popup 状态、同步、创建代理。
- 左侧：Bridge 操作、运行摘要、自检结果。
- 中间：路由管理、筛选、Profile 表格、请求链路健康度。
- 右侧：日常编辑面板，承载名称、启用、目标 URL、HTTP 方法、Provider、项目路径、返回类型、Prompt、保存、测试。
- 详情抽屉：完整 Profile 编辑、响应映射、专家配置、最近请求。

复杂协议映射、tool call、JSON 模板、安全策略 JSON 和高风险 CLI 参数不得塞入右侧日常编辑面板。

## 组件与交互

- 表格最小宽度约 940px，外层横向滚动。
- 长 URL、模型名、错误摘要、JSON 和日志必须截断、可展开或可复制。
- 主按钮每个区域只保留一个当前主任务，例如“创建代理”“保存配置”“测试 Provider”。
- 删除、raw 输出、tool input/output、日志导出等高风险能力必须在独立分组中展示。
- Toast 只反馈短动作结果；错误必须在原位置展示阶段、原因和下一步建议。
- 行点击可选择 Profile；行内按钮必须阻止误触发行选择。
- cURL 导入失败时保留原始输入，并展示解析失败原因。

## 响应式

- 小于 1180px：右侧摘要可下移，主列表优先。
- 小于 760px：单列布局，工作区在前，导航与摘要后置。
- 窄屏表格保持横向滚动，不把长 URL 强行压成不可读换行。
- 抽屉在窄屏保留关闭按钮和底部操作。
- Popup 宽度使用 `min(390px, calc(100vw - 36px))`，内容不得溢出。
- Header 状态标签允许换行，不能遮挡主操作。

## 可访问性

- 弹窗和抽屉使用 `role="dialog"`、`aria-modal="true"` 和明确标签。
- 状态变化区域使用 `aria-live="polite"`。
- Switch 使用 `role="switch"` 与 `aria-checked`，并提供清晰文案。
- 装饰性网格、太阳、扫描线必须 `aria-hidden="true"`。
- 所有交互元素必须有 `focus-visible` 状态。
- 标签页使用 `role="tab"`、`aria-selected`，后续应补齐 `aria-controls`。
- 图表和状态颜色必须配套文本，不依赖颜色单独传达。
- 动效尊重 `prefers-reduced-motion`，扫描线、太阳脉冲和网格漂移动效可关闭。

## 安全与隐私

- UI 不新增默认 Host 权限。
- Extension 不执行本地命令，本地命令只能由 Bridge 或未来明确设计的 native host 执行。
- 诊断、日志、导出和复制默认脱敏，不回显 token、cookie、完整 headers、prompt 或 Provider 原始输出。
- raw payload、tool input/output、Provider stdout/stderr 原文必须由用户显式开启，并有风险提示。
- 禁用 Profile 后 DNR 规则必须同步移除或失效。

## 验收清单

- 新用户能完成“粘贴 cURL -> 选择 Provider -> 测试 -> 保存 -> 查看诊断”。
- Options 桌面、1180px、760px 三个宽度不出现页面级横向溢出。
- 表格、Popup、抽屉、弹窗内的长 URL、长 JSON、长错误不撑破布局。
- Bridge 离线、Provider 失败、响应映射失败都有阶段、原因和下一步。
- 高风险能力默认关闭，并能看到风险说明和作用域。
- `npm test`、`npm run typecheck`、`npm run build` 通过。
