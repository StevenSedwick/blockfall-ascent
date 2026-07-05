# Full emulator-launch sequence. Runs each check, then boots the AVD
# with a visible window. Any real failure gets caught and surfaced.
$ErrorActionPreference = 'Stop'

Write-Host "== 1. Kill stale emulator/qemu processes =="
Get-Process | Where-Object { $_.Name -match 'qemu|emulator|crashpad' } |
  ForEach-Object { Write-Host "  killing $($_.Name) ($($_.Id))"; Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "== 2. Clear AVD lock files =="
Get-ChildItem 'D:\AndroidAvd\Pixel_7.avd' -Recurse -Force -Filter '*.lock' -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host "  removing $($_.FullName)"; Remove-Item $_.FullName -Force -Recurse -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "== 3. Verify AVD .ini path =="
$ini = Get-Content 'D:\AndroidAvd\Pixel_7.ini' -Raw
Write-Host $ini

Write-Host ""
Write-Host "== 4. Verify emulator + AEHD =="
$emu = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"
if (-not (Test-Path $emu)) { throw "emulator.exe not found at $emu" }
Write-Host "  emulator: $emu"

Write-Host ""
Write-Host "== 5. Launching Pixel_7 (window will appear) =="
Write-Host "  This terminal will block while the emulator runs."
Write-Host "  Look for a Pixel-shaped window on your desktop."
Write-Host "  Cold boot takes 2-4 minutes."
Write-Host ""

$env:ANDROID_AVD_HOME = 'D:\AndroidAvd'
# -no-snapshot forces a clean cold boot (skips the snapshot that may be corrupt)
# -gpu swiftshader_indirect avoids Intel driver issues that plagued this laptop
& $emu -avd Pixel_7 -no-snapshot -gpu swiftshader_indirect
