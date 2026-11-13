# بيئة معاينة محلية للتجربة قبل النشر: http://localhost:15100
# منفصلة تماماً عن النظام الحقيقي (قاعدة بيانات خاصة، بلا واتساب أو دفع أو بريد أو زكاتي).
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

docker compose -f compose.preview.yaml up -d --build

$healthUrl = "http://127.0.0.1:15100/api/health"
$deadline = (Get-Date).AddMinutes(4)
$healthy = $false
while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) { $healthy = $true; break }
  } catch { }
  Start-Sleep -Seconds 3
}
if (-not $healthy) {
  docker compose -f compose.preview.yaml logs --tail 80 app
  throw "Preview did not become healthy within four minutes."
}

# The seed file is mounted into the container; do not pipe it through PowerShell (it turns Arabic text into "?")
docker compose -f compose.preview.yaml exec -T app node scripts/preview-seed.js
if ($LASTEXITCODE -ne 0) { throw "Seeding the preview data failed." }

Write-Host ""
Write-Host "Preview is ready: http://localhost:15100/login" -ForegroundColor Green
Write-Host "Email:    preview@miqass.local"
Write-Host "Password: Preview@1234"
Write-Host "POS:      http://localhost:15100/pos  (cashier: salon preview, PIN 1234)"
Write-Host "Booking:  http://localhost:15100/preview"
