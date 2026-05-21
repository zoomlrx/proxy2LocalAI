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

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 Node.js，请先安装 Node.js 20 或更高版本。"
}

if (-not (Test-Path $bridge)) {
  Write-Error "未找到 bridge 构建产物：$bridge。请先在项目根目录运行 npm install 和 npm run build。"
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

node $bridge @args
