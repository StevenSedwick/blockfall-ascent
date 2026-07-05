# Same as launch-emulator.ps1 but tee all output to a file so we can
# read the tail even if the window closes.
$log = 'D:\AndroidAvd\emulator-run.log'
if (Test-Path $log) { Remove-Item $log -Force }

Get-Process | Where-Object { $_.Name -match 'qemu|emulator|crashpad' } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Get-ChildItem 'D:\AndroidAvd\Pixel_7.avd' -Recurse -Force -Filter '*.lock' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue }

$env:ANDROID_AVD_HOME = 'D:\AndroidAvd'
$emu = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"

Write-Host "Starting emulator (window should appear on desktop)..."
Write-Host "Full log streaming to: $log"
Write-Host ""

# Launch as a background process so PowerShell doesn't block on it.
# Redirect all output to a file so we can read the tail regardless of
# whether the window closes.
$proc = Start-Process -FilePath $emu `
  -ArgumentList '-avd','Pixel_7','-no-snapshot','-gpu','guest','-verbose' `
  -RedirectStandardOutput $log `
  -RedirectStandardError "$log.err" `
  -PassThru -WindowStyle Normal

Write-Host "Started PID=$($proc.Id). Sleeping 20 seconds then checking status..."
Start-Sleep -Seconds 20

if ($proc.HasExited) {
  Write-Host ""
  Write-Host "!! Emulator exited with code $($proc.ExitCode) after $([math]::Round((Get-Date - $proc.StartTime).TotalSeconds,1))s"
  Write-Host ""
  Write-Host "=== last 50 lines of stdout ==="
  Get-Content $log -Tail 50 -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "=== last 20 lines of stderr ==="
  Get-Content "$log.err" -Tail 20 -ErrorAction SilentlyContinue
} else {
  Write-Host "Emulator still running (PID=$($proc.Id)). Waiting for adb device..."
  $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 5
    $bootDone = & $adb -s emulator-5554 shell getprop sys.boot_completed 2>$null
    if ($bootDone -eq '1') {
      Write-Host ""
      Write-Host "*** Boot complete! Emulator ready. ***"
      & $adb devices
      break
    }
    Write-Host "  ...still booting (attempt $($i+1)/30)"
    if ($proc.HasExited) {
      Write-Host "!! Emulator exited during boot with code $($proc.ExitCode)"
      Get-Content $log -Tail 30
      break
    }
  }
}
