# Proxy2LocalAI UI Productization Phased Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将扩展 UI 从工程配置表单升级为可创建、可启停、可诊断、可维护的本地 AI 代理控制台。

**Architecture:** 以现有 React 组件为基础，先补齐控制台信息架构、Popup 真实启停和请求诊断，再降噪 Profile 编辑器与创建向导，最后收敛设计 token 和 Tailwind 迁移边界。协议和配置模型尽量复用现有 shared/bridge 能力，新增逻辑优先沉淀为可测试的纯函数。

**Tech Stack:** TypeScript, React, Vite, Chrome MV3, Vitest, shared profile/diagnostics/response template modules.

---

## Phase P0：控制台骨架与可诊断性

目标：用户打开 Options 或 Popup 后，能立即判断 Bridge、Profile、最近请求是否正常；失败请求能在两次点击内复制诊断。

### Task P0-1：Options 三段式控制台信息架构

**Files:**
- Modify: `apps/extension/src/options/main.tsx`
- Modify: `apps/extension/src/options/components/BridgeStatusBar.tsx`
- Modify: `apps/extension/src/ui.css`

**Steps:**
1. 写一个控制台状态视图模型测试，覆盖启用 Profile 数、总 Profile 数、Bridge 在线状态、最近失败数。
2. 增加可测试的控制台状态 helper。
3. 将 Options 顶部改为状态栏：Bridge 在线、同步状态、启用 Profile、最近失败、设置入口。
4. 将 Bridge 设置、导入导出从默认主区域降级为辅助设置区。
5. 调整 CSS 为控制台式布局，避免卡片嵌套和长文本撑破。
6. 运行相关测试。

**Acceptance:**
- Options 首屏可见 Bridge 状态、同步状态、启用 Profile 数、最近失败请求数。
- 主体优先呈现 Profile 列表、Profile 编辑器、最近请求诊断台。
- Bridge 设置和导入导出不再抢占主任务区域。

### Task P0-2：Popup 真实启停与状态判断

**Files:**
- Modify: `apps/extension/src/popup/main.tsx`
- Create or Modify test helper under `apps/extension/src/popup/`
- Modify: `apps/extension/src/ui.css`

**Steps:**
1. 写 Popup 视图模型测试，覆盖 Profile 截断到 4 个、启用数、最近失败摘要、查看更多状态。
2. 增加 Popup view model helper。
3. 在 Popup 中加载最近诊断记录。
4. 将“启停”按钮改为真实切换 Profile enabled，并保存、同步规则。
5. Bridge 离线时展示启动提示和 Options 设置入口。
6. Profile 超过 4 个时展示“查看更多”入口。
7. 运行相关测试。

**Acceptance:**
- Popup 启停按钮真实改变 Profile 状态。
- Bridge 离线时给出明确提示。
- Profile 超过 4 个显示“查看更多”。
- 最近失败请求在 Popup 中有摘要。

### Task P0-3：最近请求诊断台增强

**Files:**
- Modify: `apps/extension/src/options/components/RecentRequestsPanel.tsx`
- Modify: `apps/extension/src/ui.css`
- Optional Test: pure formatter/helper tests

**Steps:**
1. 写诊断展示 helper 测试，覆盖耗时格式化、阶段标签、失败计数。
2. 将列表升级为表格式调试台，字段包含时间、方法、目标接口、Profile、状态、耗时、失败阶段、操作。
3. 在列表行提供“详情”和“复制诊断”操作。
4. 详情弹窗展示阶段记录、请求摘要字段、响应模式字段的可扩展占位。
5. 长 URL、错误、响应摘要使用截断、换行和复制能力。
6. 运行相关测试。

**Acceptance:**
- 失败请求能在两次点击内复制诊断。
- 阶段码可读。
- 长文本不撑破布局。

### Task P0-4：基础可访问性修复

**Files:**
- Modify: `apps/extension/src/options/main.tsx`
- Modify: `apps/extension/src/options/components/*.tsx`
- Modify: `apps/extension/src/popup/main.tsx`
- Modify: `apps/extension/src/ui.css`

**Steps:**
1. 所有状态文本增加合适的 `aria-live`。
2. 弹窗增加标题、关闭按钮、Esc 关闭入口。
3. 图标/短按钮增加可访问名称。
4. 表单错误尽量靠近字段展示。
5. 焦点态使用统一 token。

**Acceptance:**
- 键盘可完成核心启停、保存、测试、复制诊断。
- 状态变化能被读屏区域感知。

---

## Phase P1：配置降噪与首次创建闭环

目标：新用户不被专家配置干扰，能通过 cURL 向导完成首个代理配置；模板选择默认推荐合理。

### Task P1-1：Profile 编辑器字段分层

**Files:**
- Modify: `apps/extension/src/options/components/ProfileEditor.tsx`
- Modify: `apps/extension/src/options/profileForm.ts`
- Modify: `apps/extension/src/ui.css`
- Test: `apps/extension/src/options/profileForm.test.ts`

**Steps:**
1. 写测试确认 wizard/basic 模式默认只展开基础配置，专家配置默认不展开。
2. 基础配置只保留名称、启用状态、目标地址、目标接口、HTTP 方法、AI Provider、返回类型、项目路径、提示词、保存/测试。
3. 将配置 ID、Provider 追加参数、危险 CLI、自定义命令、自定义模板、SSE 映射放入专家区。
4. 删除按钮移到危险操作区域，不与保存相邻。
5. 高风险字段增加明确风险提示。

**Acceptance:**
- 新用户首次打开编辑器主要输入项不超过 10 个。
- 保存、测试、删除视觉层级清晰。
- 专家项有风险提示。

### Task P1-2：响应模板选择器简化

**Files:**
- Modify: `apps/extension/src/options/components/ResponseTemplatePicker.tsx`
- Modify: `apps/extension/src/options/profileForm.ts`
- Test: `apps/extension/src/options/profileForm.test.ts`

**Steps:**
1. 写测试确认 responseMode 到默认模板的映射：stream -> openai_sse，block -> openai_chat_json，mapped_sse -> generic_sse，custom_json -> business_code_data_message。
2. 选择返回类型时自动推荐对应模板。
3. 模板选择器只展示四类推荐模板。
4. 模板详情和示例预览默认折叠。
5. 修复 `button` 包裹 `details` 的嵌套交互结构。

**Acceptance:**
- 返回类型变更后默认模板自动匹配。
- 模板卡片没有嵌套交互冲突。
- 样例预览不占用基础流程注意力。

### Task P1-3：创建代理向导完善

**Files:**
- Modify: `apps/extension/src/options/components/CreateProxyWizard.tsx`
- Modify: `apps/extension/src/options/profileForm.ts`
- Test: `apps/extension/src/options/profileForm.test.ts`

**Steps:**
1. 写 cURL 摘要 helper 测试，覆盖域名、路径、方法、body 摘要、stream 推断。
2. cURL 解析后展示摘要。
3. 根据 cURL 请求体自动推荐返回格式。
4. 测试失败时展示阶段，而不是只展示失败文案。
5. 保存前展示最终配置摘要。

**Acceptance:**
- 无 Profile 时优先展示创建入口。
- cURL 解析成功后展示请求摘要。
- 测试失败显示失败阶段。

---

## Phase P2：设计系统与 Tailwind 迁移边界

目标：先把 UI 样式维护从散乱 CSS 收敛到 token 和组件约定，再评估 Tailwind 逐步迁移。

### Task P2-1：设计 token 最小落地

**Files:**
- Modify: `apps/extension/src/ui.css`

**Steps:**
1. 在 `:root` 中定义颜色、间距、圆角、边框、焦点态 token。
2. 将按钮、输入框、面板、状态 badge 使用 token。
3. 统一成功、警告、错误、静默文本样式。

**Acceptance:**
- CSS 主色、状态色、边框、背景不再散落硬编码。
- 控制台气质稳定，避免营销式装饰。

### Task P2-2：Tailwind 迁移边界文档化

**Files:**
- Modify: this plan or create follow-up doc under `docs/plans/`
- Optional: `apps/extension/package.json` only after technical review

**Steps:**
1. 明确 Tailwind v4 只在扩展内本地打包，不使用 CDN。
2. 明确先组件化、后迁移 utility class。
3. 明确复杂组件继续封装，避免超长 className。
4. Tailwind 引入作为单独工程任务，不阻塞 P0/P1。

**Acceptance:**
- 工程团队能独立评审是否引入 Tailwind。
- P0/P1 不被样式技术迁移阻塞。

---

## Verification Plan

每个阶段至少执行：

```bash
npm test
npm run typecheck
```

完成 UI 结构调整后执行：

```bash
npm run build
```

手工检查：
- Options 无 Profile 首屏。
- Options 多 Profile 控制台。
- Popup Bridge 在线/离线。
- 最近请求为空、成功、失败、长 URL。
- Profile 编辑器基础/高级/专家展开状态。
- 创建向导 cURL 成功和失败路径。
