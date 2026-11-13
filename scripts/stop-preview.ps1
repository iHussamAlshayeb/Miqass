param(
  # Also delete the preview database (a fresh demo salon is created next start).
  [switch]$Reset
)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

if ($Reset) {
  docker compose -f compose.preview.yaml down -v
  Write-Host "Preview stopped and its data deleted." -ForegroundColor Yellow
} else {
  docker compose -f compose.preview.yaml down
  Write-Host "Preview stopped (data kept)." -ForegroundColor Green
}
