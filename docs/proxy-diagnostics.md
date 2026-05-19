# 代理无响应定位清单

1. 确认 bridge 在线：`Invoke-RestMethod http://127.0.0.1:39399/health`。
2. 确认配置已同步：`Invoke-RestMethod "http://127.0.0.1:39399/admin/profiles?token=web2LocalAgent-local-token"`。
3. 直接请求 bridge：`Invoke-WebRequest -Method POST "http://127.0.0.1:39399/proxy/<profileId>?token=web2LocalAgent-local-token" -ContentType "application/json" -Body "{}"`。
4. 查看日志：`Get-Content -Wait -Tail 80 apps/bridge/data/requests.log`。
5. 若有 `provider_done` 但没有 `response_done_written`，定位 bridge 写回。
6. 若有 `response_done_written` 但业务页面无结果，定位响应格式是否符合目标页面预期。
7. 若没有 `request_received`，定位 DNR 规则、域名权限、请求 URL 和 HTTP 方法是否匹配。
