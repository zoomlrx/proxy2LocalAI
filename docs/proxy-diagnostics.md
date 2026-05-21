# 代理无响应定位清单

这份清单用于定位“浏览器请求已经被 Proxy2LocalAI 重定向，但页面没有拿到预期结果”的问题。

## 1. 确认 Bridge 是否在线

```powershell
Invoke-RestMethod http://127.0.0.1:39399/health
```

正常情况下会看到：

```json
{
  "ok": true,
  "service": "proxy2localai-bridge",
  "profileCount": 1
}
```

如果 Bridge 未连接，先运行：

```powershell
.\scripts\start-bridge.ps1
```

macOS/Linux：

```bash
sh scripts/start-bridge.sh
```

## 2. 运行自检

```powershell
npm run doctor
```

也可以直接请求接口：

```powershell
Invoke-RestMethod `
  -Headers @{ "x-proxy2localai-token" = "proxy2localai-local-token" } `
  http://127.0.0.1:39399/doctor
```

重点看三类结果：

- `代理配置`：没有配置时，需要在扩展配置页导入或新增配置。
- `数据目录`：不可写时，设置 `PROXY2LOCALAI_DATA_DIR` 到可写目录。
- `Provider 命令`：找不到 `claude`、`codex` 或自定义命令时，需要安装 CLI 并加入 PATH。

## 3. 确认配置已经同步

```powershell
Invoke-RestMethod `
  -Headers @{ "x-proxy2localai-token" = "proxy2localai-local-token" } `
  http://127.0.0.1:39399/admin/profiles
```

如果这里没有 profile，但扩展配置页里有配置，点击扩展配置页的 `同步`。

## 4. 直接请求 Bridge

把 `<profileId>` 换成实际配置 ID：

```powershell
Invoke-WebRequest `
  -Method POST `
  -Headers @{ "x-proxy2localai-token" = "proxy2localai-local-token" } `
  -ContentType "application/json" `
  -Body "{}" `
  "http://127.0.0.1:39399/proxy/<profileId>"
```

如果直接请求能返回，问题通常在浏览器 DNR 规则、目标域名权限或页面对响应格式的预期。

## 5. 查看日志

默认日志位置：

- Windows：`%APPDATA%\Proxy2LocalAI\requests.log`
- macOS：`~/Library/Application Support/Proxy2LocalAI/requests.log`
- Linux：`~/.config/proxy2localai/requests.log`

开发仓库里也可能通过环境变量改到其他位置：

```powershell
$env:PROXY2LOCALAI_REQUESTS_LOG_PATH="C:/path/to/requests.log"
```

实时查看日志：

```powershell
Get-Content -Wait -Tail 80 "$env:APPDATA\Proxy2LocalAI\requests.log"
```

关键阶段说明：

- `request_received`：Bridge 收到了代理请求。
- `profile_matched`：请求匹配到了启用的 profile。
- `provider_spawn`：Claude/Codex/Custom 进程已经启动。
- `provider_stdout_line`：Provider 已经输出原始数据。
- `provider_first_chunk`：Bridge 已解析到第一段可返回文本。
- `provider_done`：Provider 正常结束。
- `provider_timeout`：Provider 超时后被终止。
- `provider_stderr` / `provider_error`：Provider 标准错误或调用异常。

## 6. 常见判断

- 没有 `request_received`：优先查扩展权限、DNR 规则、目标 URL 和 HTTP 方法是否匹配。
- 有 `request_received`，但没有 `provider_spawn`：优先查 profile 是否启用、provider 配置是否完整。
- 有 `provider_spawn`，但没有 `provider_first_chunk`：Claude/Codex 可能正在初始化 hooks、插件或 MCP，可以先放宽超时，或换一个更轻量的项目目录对照测试。
- 有 `response_done_written`，但业务页面无结果：检查响应模式是否符合页面预期，必要时使用 `自定义 JSON` 模板。
