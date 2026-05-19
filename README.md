# web2LocalAgent

web2LocalAgent 是一个 Chrome/Edge MV3 浏览器扩展与本地 Node bridge 的组合，用来把指定线上 API 请求代理到本机 AI CLI，例如 Claude Code 或 Codex。

## 架构

- `apps/extension`：MV3 扩展，负责 profile 配置、`chrome.storage.local` 持久化、`declarativeNetRequest` 动态重定向规则、Popup 和 Options 页面。
- `apps/bridge`：只监听 `127.0.0.1` 的本地 HTTP 服务，负责鉴权、CORS、请求上下文组装、调用本地 AI CLI，并返回 OpenAI 兼容 JSON 或 SSE。
- `packages/shared`：共享配置模型、提示词拼装和 OpenAI 兼容响应工具。

请求上下文会被拼成：

```text
<parames>{接口参数 JSON}</parames>{可选提示词}
```

其中 `接口参数 JSON` 会包含页面来源上下文：

```json
{
  "page": {
    "url": "https://app.example.com/workspace/123?tab=chat",
    "origin": "https://app.example.com",
    "source": "x-web2LocalAgent-page-url"
  }
}
```

页面地址提取优先级为 `x-web2LocalAgent-page-url`、`referer`、`origin`。当前版本不主动修改页面请求头，避免触发额外 CORS 预检；后续接入 CDP 或内容脚本时，可以显式写入 `x-web2LocalAgent-page-url` 来获得完整页面 URL。

## 快速开始

```powershell
npm install
npm run build
npm run start:bridge
```

然后在 Chrome 或 Edge 中打开扩展管理页，启用开发者模式，加载目录：

```text
C:\project\demoProject\web2LocalAgent\apps\extension\dist
```

默认 bridge 地址是：

```text
http://127.0.0.1:39399
```

默认本地 token 是：

```text
web2LocalAgent-local-token
```

生产或长期使用时建议设置环境变量：

```powershell
$env:web2LocalAgent_TOKEN="your-local-token"
$env:web2LocalAgent_PORT="39399"
npm run start:bridge
```

## 配置说明

每套代理配置包含：

- `粘贴 cURL 配置`：可粘贴常见 cURL 命令，自动填充目标地址、目标接口和 HTTP 方法。
- `目标地址`：例如 `https://api.openai.com`
- `目标接口`：例如 `/v1/chat/completions`
- `HTTP 方法`：默认 `POST`
- `AI Provider`：`Claude Code`、`Codex` 或 `Custom`
- `本地 AI 配置项目路径`：Claude/Codex 的工作目录，用来读取项目级配置，例如 `.claude`、`CLAUDE.md` 等；点击输入框会弹出路径输入框。
- `返回类型`：普通 JSON 或流式 SSE
- `提示词`：可选，追加在 `<parames>...</parames>` 后
- `超时` 与 `请求体上限`：请求体上限默认为 `0`，表示不限。

## Provider 行为

- Claude Code：默认执行 `claude -p --output-format json`，流式模式使用 `stream-json`、`--verbose` 与 `--include-partial-messages`。
- Codex：默认执行 `codex exec --skip-git-repo-check --json -C <projectDir> -`。
- Custom：执行用户配置的命令和参数，把提示词写入 stdin，stdout 作为 AI 输出。

## OpenAI 兼容返回

普通模式返回：

```json
{
  "object": "chat.completion",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "AI 输出"
      },
      "finish_reason": "stop"
    }
  ]
}
```

流式模式返回 `text/event-stream`，每段为 OpenAI chunk 形状，并以：

```text
data: [DONE]
```

结束。

## 常用命令

```powershell
npm test
npm run typecheck
npm run build
npm run dev:bridge
npm run dev:extension
```

## 排障

如果请求已经被重定向但代理后的请求没有返回，参考 [代理无响应定位清单](docs/proxy-diagnostics.md)。

如果请求已经被重定向到 `http://127.0.0.1:39399/proxy/...`，但调用失败，先检查 bridge 当前是否有配置：

```powershell
Invoke-RestMethod http://127.0.0.1:39399/health
```

如果返回里的 `profileCount` 是 `0`，说明浏览器里有 DNR 规则，但 bridge 尚未同步 profile。打开扩展配置页点击“同步”即可。bridge 会把同步后的配置保存到：

```text
apps/bridge/data/profiles.json
```

流式请求是否真的进入 Claude/Codex，可以同时看两处：

```powershell
Get-Content -Wait -Tail 50 apps/bridge/data/requests.log
```

浏览器 DevTools 的 EventStream 里会先出现：

```text
event: proxy_status
data: {"stage":"provider_start",...}
```

这表示 bridge 已经收到请求并准备调用本地 AI。后续 `provider_spawn`、`provider_stdout_line`、`provider_exit`、`provider_timeout` 等也会以 `event: proxy_status` 形式写入 EventStream，便于直接在浏览器里判断本地 CLI 是否启动和是否有 stdout。`requests.log` 中也会记录同样的关键阶段：

- `provider_start`：bridge 已匹配 profile，开始调用 provider。
- `provider_spawn`：Claude/Codex CLI 进程已经启动，日志里会包含命令、参数、cwd 和 prompt 长度。
- `provider_stdout_line`：CLI 已经往 stdout 输出了一行原始数据；这能证明 Claude Code 有返回，只是这一行不一定是 assistant 文本。
- `provider_first_chunk`：bridge 已解析到第一段 assistant 文本，并已写回浏览器 SSE。
- `provider_done`：CLI 正常结束。
- `provider_timeout`：CLI 超过 profile 的超时时间后被 bridge 终止。
- `provider_stderr` / `provider_error`：CLI 标准错误或 provider 调用异常。

如果只有 `provider_stdout_line` 里的 `system/init`、`hook_*`，但没有 `provider_first_chunk`，说明 Claude Code 启动了，也有系统级输出，但还没有生成可返回给接口的 assistant 内容。常见原因是项目级 hooks、插件或 MCP 初始化太慢；可以先把 profile 超时时间调大，或换一个更轻量的本地 AI 配置项目路径做对照测试。

也可以通过环境变量指定保存位置：

```powershell
$env:web2LocalAgent_PROFILES_PATH="C:/path/to/profiles.json"
npm run start:bridge
```

## 安全边界

- bridge 只监听 `127.0.0.1`。
- 扩展只为启用的指定 API 生成动态规则。
- 代理入口通过本地 token 鉴权；DNR 重定向会把 token 附加到本地 URL 查询参数。
- 扩展产物不依赖远程托管代码。

## 已知限制

- 第一版只支持指定 API 代理，不做浏览器全局代理或 HTTPS MITM。
- bridge 需要用户手动启动；后续可以升级为 Native Messaging 主机。
- 第一版返回 OpenAI Chat Completions 兼容结构，不支持任意响应模板映射。

## 超时策略

- `timeoutMs` 默认为 `0`，表示不限制本地 AI 运行时间。
- 当 `timeoutMs` 设置为正整数时，bridge 会在对应毫秒数后终止本地 CLI，并返回 OpenAI 兼容错误 chunk。
- 长任务建议保持 `0`，需要防止请求长期占用时再为具体 profile 设置超时。
