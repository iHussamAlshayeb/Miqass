$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

docker compose --profile public ps

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:15000/api/health" -TimeoutSec 10
  Write-Host "Local health: $($response.StatusCode) $($response.Content)" -ForegroundColor Green
} catch {
  Write-Host "Local health check failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

