$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "doctor.mjs") @args
