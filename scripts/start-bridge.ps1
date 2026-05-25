param(
  [int]$Port,
  [string]$Token,
  [string]$DataDir
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoBridge = Join-Path $root "apps/bridge/dist/index.js"
$packageBridge = Join-Path $PSScriptRoot "dist/index.js"
$bridge = if (Test-Path $repoBridge) { $repoBridge } else { $packageBridge }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js was not found. Please install Node.js 20 or later."
  Write-Host "  Download: https://nodejs.org/" -ForegroundColor Yellow
  exit 1
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 20) {
  Write-Error "Node.js version is too old. Node.js 20 or later is required."
  Write-Host "  Current: $(node --version)" -ForegroundColor Yellow
  Write-Host "  Download: https://nodejs.org/" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $bridge)) {
  Write-Error "Bridge build output was not found: $bridge"
  Write-Host "  Run these commands in the project root first:" -ForegroundColor Yellow
  Write-Host "    npm install" -ForegroundColor Cyan
  Write-Host "    npm run build" -ForegroundColor Cyan
  exit 1
}

if (Test-Path $repoBridge) {
  $nodeModules = Join-Path $root "node_modules"
  if (-not (Test-Path $nodeModules)) {
    Write-Warning "node_modules was not found. Dependencies may be missing."
    Write-Host "  Suggested command: npm install" -ForegroundColor Yellow
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

& node $bridge @args
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  Write-Host ""
  Write-Host "Bridge failed to start." -ForegroundColor Red
  Write-Host "  Node version: $(node --version)" -ForegroundColor Yellow
  Write-Host "  Try diagnostics: npm run doctor" -ForegroundColor Yellow
  exit $exitCode
}
