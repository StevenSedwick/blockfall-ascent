# Safe cleanups only. Gradle/npm/temp caches are re-created on demand.
$before = (Get-PSDrive C).Free
$targets = @(
  "$env:USERPROFILE\.gradle\caches",         # Gradle deps — regenerated next build
  "$env:USERPROFILE\.gradle\daemon",         # Old daemon logs
  "$env:LOCALAPPDATA\npm-cache",             # npm — regenerated
  "$env:APPDATA\npm-cache",                  # older npm cache path
  "$env:TEMP",                               # our own temp files
  'C:\Windows\SoftwareDistribution\Download' # Windows Update cache (safe)
)
foreach ($t in $targets) {
  if (Test-Path $t) {
    Write-Host "Cleaning: $t"
    Get-ChildItem $t -Force -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

# Redirect future Gradle downloads to D: so C: doesn't refill
[Environment]::SetEnvironmentVariable('GRADLE_USER_HOME','D:\gradle','User')
Write-Host ""
Write-Host "GRADLE_USER_HOME set to D:\gradle for future shells"

$after = (Get-PSDrive C).Free
$freedGB = [math]::Round(($after - $before)/1GB, 2)
Write-Host ""
Write-Host "Freed: $freedGB GB"
Write-Host ("Free on C: now: {0:N2} GB" -f ($after/1GB))
