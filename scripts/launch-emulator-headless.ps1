# Headless emulator launch — no Qt window, no audio.
# Use adb + scrcpy (if installed) to interact.
$log = 'D:\AndroidAvd\emulator-headless.log'
if (Test-Path $log) { Remove-Item $log -Force }

Get-Process | Where-Object { $_.Name -match 'qemu|emulator|crashpad' } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Get-ChildItem 'D:\AndroidAvd\Pixel_7.avd' -Recurse -Force -Filter '*.lock' -ErrorAction SilentlyContinue |
  ForEach-Object { Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue }

$env:ANDROID_AVD_HOME = 'D:\AndroidAvd'
$emu = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"

Write-Host "Launching HEADLESS Pixel_7..."
Write-Host "Log: $log"
Write-Host ""

# -no-window : skip Qt UI entirely
# -no-audio  : skip audio (avoid audio driver issues)
# -no-boot-anim : slightly faster boot
# -gpu swiftshader_indirect : software GPU (safe on Intel iGPU)
$proc = Start-Process -FilePath $emu `
  -ArgumentList '-avd','Pixel_7','-no-snapshot','-no-window','-no-audio','-no-boot-anim','-gpu','swiftshader_indirect' `
  -RedirectStandardOutput $log `
  -RedirectStandardError "$log.err" `
  -PassThru -WindowStyle Hidden

Write-Host "Launcher PID=$($proc.Id) - waiting for qemu child + adb..."

$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$bootDone = $null

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 5
  $qemu = Get-Process qemu-system-x86_64* -ErrorAction SilentlyContinue
  if (-not $qemu) {
    Write-Host "  [$($i*5+5)s] qemu process gone!"
    Write-Host "=== stdout tail ==="
    Get-Content $log -Tail 20 -ErrorAction SilentlyContinue
    Write-Host "=== stderr tail ==="
    Get-Content "$log.err" -Tail 20 -ErrorAction SilentlyContinue
    exit 1
  }
  $devList = & $adb devices 2>$null
  $isOnline = $devList -match 'emulator-5554\s+device'
  if ($isOnline) {
    $bootDone = & $adb -s emulator-5554 shell getprop sys.boot_completed 2>$null
    if ($bootDone -eq '1') {
      $bootAnim = & $adb -s emulator-5554 shell getprop init.svc.bootanim 2>$null
      Write-Host ""
      Write-Host "*** Boot complete at $($i*5+5)s! bootanim=$bootAnim ***"
      & $adb devices
      exit 0
    }
    Write-Host "  [$($i*5+5)s] device online, waiting for boot_completed..."
  } else {
    Write-Host "  [$($i*5+5)s] qemu alive (PID=$($qemu.Id)), adb still offline..."
  }
}
Write-Host "Timed out after 5 minutes. Emulator may still boot; check manually."
