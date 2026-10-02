param(
  [switch]$Public,
  [switch]$EnableCron
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath "Miqass.env")) {
  throw "Miqass.env is missing from the project root."
}

if ($Public -and -not (Test-Path -LiteralPath ".cloudflared\tunnel.env")) {
  throw "Cloudflare tunnel credentials are missing."
}

$env:MIQASS_DISABLE_CRON_JOBS = if ($EnableCron) { "false" } else { "true" }

docker compose config --quiet
docker compose up -d --build app

$healthUrl = "http://127.0.0.1:15000/api/health"
$deadline = (Get-Date).AddMinutes(3)
$healthy = $false

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      $healthy = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 3
  }
}

if (-not $healthy) {
  docker compose logs --tail 100 app
  throw "Miqass did not become healthy within three minutes."
}

if ($Public) {
  docker compose --profile public up -d cloudflared
}

docker compose --profile public ps
Write-Host "Miqass is healthy at http://127.0.0.1:15000" -ForegroundColor Green
if (-not $EnableCron) {
  Write-Host "Background cron jobs are disabled until Render is stopped." -ForegroundColor Yellow
}
