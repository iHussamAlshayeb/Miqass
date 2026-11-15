param(
  # عدد الساعات الماضية المطلوب جمع سجلاتها
  [int]$Hours = 6
)

# يجمع حالة الحاويات وسجلات النفق والتطبيق في ملف واحد لتشخيص الانقطاعات:
#   powershell -ExecutionPolicy Bypass -File scripts\collect-logs.ps1 -Hours 12
$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$logDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$outFile = Join-Path $logDir "diagnostics-$stamp.log"

$sections = @(
  @{ Title = "compose ps"; Command = { docker compose --profile public ps } },
  @{ Title = "docker info (summary)"; Command = { docker info --format "Server {{.ServerVersion}} | CPUs {{.NCPU}} | Mem {{.MemTotal}} | OS {{.OperatingSystem}}" } },
  @{ Title = "host DNS check"; Command = { Resolve-DnsName region1.v2.argotunnel.com -Type A -ErrorAction SilentlyContinue | Select-Object -First 2 | Format-Table -AutoSize | Out-String } },
  @{ Title = "container DNS check"; Command = { docker compose exec -T app node -e "require('dns').promises.resolve4('region1.v2.argotunnel.com').then(a=>console.log('ok',a.join(','))).catch(e=>console.log('fail',e.code))" } },
  @{ Title = "cloudflared logs"; Command = { docker compose --profile public logs --no-color --timestamps --since "$($Hours)h" cloudflared } },
  @{ Title = "app logs"; Command = { docker compose logs --no-color --timestamps --since "$($Hours)h" app } },
  @{ Title = "whatsapp logs"; Command = { docker compose logs --no-color --timestamps --since "$($Hours)h" whatsapp } }
)

foreach ($section in $sections) {
  Add-Content -LiteralPath $outFile -Value "`n===== $($section.Title) ====="
  try { & $section.Command 2>&1 | Out-String -Width 400 | Add-Content -LiteralPath $outFile } catch { Add-Content -LiteralPath $outFile -Value "error: $_" }
}

Write-Host "Saved: $outFile" -ForegroundColor Green
