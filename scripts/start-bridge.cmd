@echo off
setlocal

set "ROOT=%~dp0.."
set "BRIDGE=%ROOT%\apps\bridge\dist\index.js"
if not exist "%BRIDGE%" set "BRIDGE=%~dp0dist\index.js"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo Error: Node.js was not found. Please install Node.js 20 or later.
  echo   Download: https://nodejs.org/
  exit /b 1
)

if not exist "%BRIDGE%" (
  echo Error: Bridge build output was not found: %BRIDGE%
  echo   Run these commands in the project root first:
  echo     npm install
  echo     npm run build
  exit /b 1
)

node "%BRIDGE%" %*
if %ERRORLEVEL% neq 0 (
  echo.
  echo Bridge failed to start.
  echo   Node version:
  node --version
  echo   Try diagnostics: npm run doctor
  exit /b %ERRORLEVEL%
)
