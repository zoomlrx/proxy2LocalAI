@echo off
setlocal

set "ROOT=%~dp0.."
set "BRIDGE=%ROOT%\apps\bridge\dist\index.js"
if not exist "%BRIDGE%" set "BRIDGE=%~dp0dist\index.js"

if not exist "%BRIDGE%" (
  echo 未找到 bridge 构建产物：%BRIDGE%
  echo 请先在项目根目录运行 npm install 和 npm run build。
  exit /b 1
)

node "%BRIDGE%" %*
