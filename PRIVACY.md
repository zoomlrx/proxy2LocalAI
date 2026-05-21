# 隐私说明

Proxy2LocalAI 不提供云端服务，也不会主动把数据上传到项目维护者或第三方服务器。它的主要数据流发生在你的浏览器、本机 Bridge 和你自己配置的本地 AI CLI 之间。

## 扩展会存储什么

扩展使用 `chrome.storage.local` 保存：

- Bridge 地址。
- 本地 token。
- 代理 profile，包括目标域名、目标路径、HTTP 方法、Provider 类型、本地项目路径、提示词和响应模式。

这些数据保存在浏览器本地，不会由扩展主动同步到远程服务器。

## Bridge 会记录什么

Bridge 默认在本机数据目录写入 `requests.log`，用于排障。日志会记录请求阶段、profile ID、Provider 类型、输出长度、错误信息等诊断字段。

Bridge 会过滤 `authorization`、`x-proxy2localai-token` 和旧版 token 请求头，但你仍应避免在 profile 名称、提示词或自定义参数中写入不必要的敏感信息。

## 代理请求会去哪里

当某个启用 profile 命中目标 API 时，扩展会把该请求重定向到本机 Bridge。Bridge 会把请求上下文拼入提示词，并交给你配置的本机 AI CLI。

如果你的本机 AI CLI 自身连接云端模型服务，数据处理方式取决于该 CLI 和模型服务的隐私政策。

## 分享配置

请优先使用 `导出模板` 分享配置。模板会移除 token、停用 profile，并把本机项目路径替换为占位文本。

不要公开分享 `导出备份` 文件，因为备份会保留本机 token 和完整 profile。
