# Proxy2LocalAI

Proxy2LocalAI 是一个 Chrome/Edge MV3 浏览器扩展与本地 Bridge 服务的组合，用来把指定线上 API 请求代理到本机 AI CLI，例如 Claude Code 或 Codex。

## 架构

- `apps/extension`：浏览器扩展，负责代理配置、动态重定向规则、Popup 和 Options 页面。
- `apps/bridge`：只监听 `127.0.0.1` 的本地 HTTP 服务，负责鉴权、CORS、请求上下文组装、调用本地 AI CLI，并返回 OpenAI 兼容 JSON、SSE 或自定义 JSON。
- `packages/shared`：共享配置模型、配置导入导出、提示词拼装和 OpenAI 兼容响应工具。

请求上下文会被拼成：

```text
<parames>{接口参数 JSON}</parames>{可选提示词}
```

## 快速开始

开发模式：

```powershell
npm install
npm run build
npm run start:bridge
```

也可以使用跨端启动脚本：

```powershell
.\scripts\start-bridge.ps1
```

```bash
sh scripts/start-bridge.sh
```

然后在 Chrome 或 Edge 中打开扩展管理页，启用开发者模式，加载目录：

```text
C:\project\demoProject\proxy2LocalAI\apps\extension\dist
```

默认 Bridge 地址：

```text
http://127.0.0.1:39399
```

默认本地 token：

```text
proxy2localai-local-token
```

## 普通用户安装思路

发布包会包含两个文件：

- `extension.zip`：解压后在 Chrome/Edge 扩展管理页加载。
- `bridge.zip`：解压后按系统运行 `start.cmd`、`start.ps1` 或 `start.sh`。

Bridge 包里也包含 `doctor.mjs`、`doctor.cmd`、`doctor.ps1` 和 `doctor.sh`，用于定位 Node、配置、数据目录和 Claude/Codex 命令是否可用。

## 配置导入导出

扩展配置页支持三类文件操作：

- `导入配置`：导入 `.json` 配置文件，支持新版 Proxy2LocalAI 配置文件和旧版 `AppConfig` JSON。
- `导出备份`：保留本机 token、Bridge 地址和 profile，用于同一用户自己的备份迁移。
- `导出模板`：移除 token，把 profile 停用，并把本机项目目录替换成占位提示，适合分享给其他人。

导出的配置文件格式示例：

```json
{
  "app": "Proxy2LocalAI",
  "schemaVersion": 1,
  "mode": "backup",
  "exportedAt": "2026-05-21T08:00:00.000Z",
  "config": {
    "bridgeBaseUrl": "http://127.0.0.1:39399",
    "token": "proxy2localai-local-token",
    "profiles": []
  }
}
```

## Bridge 自检

扩展配置页可以点击 `自检 Bridge`。命令行也可以运行：

```powershell
npm run doctor
```

或直接请求接口：

```powershell
Invoke-RestMethod `
  -Headers @{ "x-proxy2localai-token" = "proxy2localai-local-token" } `
  http://127.0.0.1:39399/doctor
```

自检会检查：

- Bridge 是否响应。
- 当前加载了多少套代理配置。
- 配置和日志目录是否可写。
- 已启用 profile 需要的 `claude`、`codex` 或自定义命令是否能在 PATH 中找到。

自检不会真正调用 Claude/Codex，也不会消耗模型额度。

## 配置说明

每套代理配置包含：

- `粘贴 cURL 配置`：可粘贴常见 cURL 命令，自动填充目标地址、目标接口和 HTTP 方法。
- `目标地址`：例如 `https://api.openai.com`
- `目标接口`：例如 `/v1/chat/completions`
- `HTTP 方法`：默认 `POST`
- `AI Provider`：`Claude Code`、`Codex` 或 `Custom`
- `本地 AI 配置项目路径`：Claude/Codex 的工作目录，用来读取项目级配置。
- `返回类型`：普通 JSON、流式 SSE 或自定义 JSON。
- `提示词`：可选，追加在 `<parames>...</parames>` 后。
- `超时` 与 `请求体上限`：`0` 表示不限制。

## Provider 行为

- Claude Code：默认执行 `claude -p --output-format json`，流式模式使用 `stream-json`、`--verbose` 与 `--include-partial-messages`。
- Codex：默认执行 `codex exec --skip-git-repo-check --full-auto --json -C <projectDir> -`。
- Custom：执行用户配置的命令和参数，把提示词写入 stdin，stdout 作为 AI 输出。

## 数据目录和环境变量

默认数据目录：

- Windows：`%APPDATA%\Proxy2LocalAI`
- macOS：`~/Library/Application Support/Proxy2LocalAI`
- Linux：`~/.config/proxy2localai`

常用环境变量：

```powershell
$env:PROXY2LOCALAI_TOKEN="your-local-token"
$env:PROXY2LOCALAI_PORT="39399"
$env:PROXY2LOCALAI_DATA_DIR="C:/Users/me/AppData/Roaming/Proxy2LocalAI"
npm run start:bridge
```

也可以精确指定文件：

```powershell
$env:PROXY2LOCALAI_PROFILES_PATH="C:/path/to/profiles.json"
$env:PROXY2LOCALAI_REQUESTS_LOG_PATH="C:/path/to/requests.log"
npm run start:bridge
```

旧版 `web2LocalAgent_*` 环境变量仍兼容，但新配置建议使用 `PROXY2LOCALAI_*`。

## 常用命令

```powershell
npm test
npm run typecheck
npm run build
npm run dev:bridge
npm run dev:extension
npm run doctor
```

## 排障

如果请求已经被重定向但代理后的请求没有返回，参考 [代理无响应定位清单](docs/proxy-diagnostics.md)。

优先检查：

```powershell
Invoke-RestMethod http://127.0.0.1:39399/health
npm run doctor
```

如果 `profileCount` 是 `0`，说明浏览器里可能有 DNR 规则，但 Bridge 尚未同步 profile。打开扩展配置页点击 `同步` 即可。

## 安全边界

- Bridge 只监听 `127.0.0.1`。
- 扩展只为启用的指定 API 生成动态规则。
- 代理入口通过本地 token 鉴权。
- 扩展产物不依赖远程托管代码。
- 分享模板默认停用 profile，并移除 token。

## 已知限制

- 当前只支持指定 API 代理，不做浏览器全局代理或 HTTPS MITM。
- Bridge 仍需要本机 Node.js；后续可以升级为单文件可执行程序或 Native Messaging 主机。
- 浏览器扩展不能读取文件夹真实绝对路径，项目路径仍需要用户手动填写或从模板导入后修正。
