param(
  [int]$Port,
  [string]$Token,
  [string]$DataDir
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$repoBridge = Join-Path $root "apps/bridge/dist/index.js"
$packageBridge = Join-Path $PSScriptRoot "dist/index.js"
$bridge = if (Test-Path $repoBridge) { $repoBridge } else { $packageBridge }

# 检查 Node.js 是否已安装
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 Node.js，请先安装 Node.js 20 或更高版本。"
  Write-Host "  下载地址: https://nodejs.org/" -ForegroundColor Yellow
  exit 1
}

# 检查 Node.js 版本
$nodeVersion = (node --version) -replace '^v', '' -split '\.' | ForEach-Object { [int]$_ } | Select-Object -First 1
if ($nodeVersion -lt 20) {
  Write-Error "Node.js 版本过低 (当前 v$($nodeVersion).x)，需要 20 或更高版本。"
  Write-Host "  当前版本: $(node --version)" -ForegroundColor Yellow
  Write-Host "  下载地址: https://nodejs.org/" -ForegroundColor Yellow
  exit 1
}

# 检查构建产物是否存在
if (-not (Test-Path $bridge)) {
  Write-Error "未找到 bridge 构建产物：$bridge"
  Write-Host "  请先在项目根目录运行以下命令:" -ForegroundColor Yellow
  Write-Host "    npm install" -ForegroundColor Cyan
  Write-Host "    npm run build" -ForegroundColor Cyan
  exit 1
}

# 检查 node_modules 是否存在（仅在源码模式下）
if (Test-Path $repoBridge) {
  $nodeModules = Join-Path $root "node_modules"
  if (-not (Test-Path $nodeModules)) {
    Write-Warning "未检测到 node_modules，依赖可能未安装。"
    Write-Host "  建议运行: npm install" -ForegroundColor Yellow
  }
}

if ($Port) {
  $env:PROXY2LOCALAI_PORT = [string]$Port
}

if ($Token) {
  $env:PROXY2LOCALAI_TOKEN = $Token
}

if ($DataDir) {
  $env:PROXY2LOCALAI_DATA_DIR = $DataDir
}

try {
  node $bridge @args
}
catch {
  $exitCode = $_.Exception.GetType().Name -eq "StopUpstreamCommandsException" ? 1 : 1
  Write-Host ""
  Write-Host "Bridge 启动失败。" -ForegroundColor Red
  Write-Host "  Node 版本: $(node --version)" -ForegroundColor Yellow
  Write-Host "  尝试运行自检: npm run doctor" -ForegroundColor Yellow
  exit $exitCode
}
