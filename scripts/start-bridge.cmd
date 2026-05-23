@echo off
setlocal

set "ROOT=%~dp0.."
set "BRIDGE=%ROOT%\apps\bridge\dist\index.js"
if not exist "%BRIDGE%" set "BRIDGE=%~dp0dist\index.js"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo 错误：未找到 Node.js，请先安装 Node.js 20 或更高版本。
  echo   下载地址: https://nodejs.org/
  exit /b 1
)

if not exist "%BRIDGE%" (
  echo 错误：未找到 bridge 构建产物：%BRIDGE%
  echo   请先在项目根目录运行以下命令:
  echo     npm install
  echo     npm run build
  exit /b 1
)

node "%BRIDGE%" %*
if %ERRORLEVEL% neq 0 (
  echo.
  echo Bridge 启动失败。
  echo   Node 版本:
  node --version
  echo   尝试运行自检: npm run doctor
  exit /b %ERRORLEVEL%
)
