param(
  # Registers a daily Windows scheduled task that runs this script at 05:00.
  [switch]$Install,
  # Removes the scheduled task.
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$taskName = "Miqass - Update Cloudflare Tunnel"

if ($Install) {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" `
    -WorkingDirectory $projectRoot
  $trigger = New-ScheduledTaskTrigger -Daily -At "05:00"
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Host "Scheduled '$taskName' daily at 05:00." -ForegroundColor Green
  return
}

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed '$taskName'." -ForegroundColor Yellow
  return
}

if (-not (Test-Path -LiteralPath ".cloudflared\tunnel.env")) {
  throw "Cloudflare tunnel credentials are missing."
}

$logDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "tunnel-update.log"

function Get-TunnelVersion {
  try { (docker compose --profile public exec -T cloudflared cloudflared --version 2>$null | Select-Object -First 1) } catch { "unknown" }
}

$before = Get-TunnelVersion
docker compose --profile public pull cloudflared
# --no-deps: touch the tunnel only; the app keeps running with its current settings.
# The container is recreated only when a newer image was pulled.
docker compose --profile public up -d --no-deps cloudflared
Start-Sleep -Seconds 5
$after = Get-TunnelVersion

$line = "{0}  before: {1}  after: {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm"), $before, $after
Add-Content -LiteralPath $logFile -Value $line
Write-Host $line -ForegroundColor Green
