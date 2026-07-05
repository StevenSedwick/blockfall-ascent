$paths = @(
  "$env:USERPROFILE\.gradle",
  "$env:LOCALAPPDATA\npm-cache",
  "$env:APPDATA\npm-cache",
  $env:TEMP,
  'C:\Windows\SoftwareDistribution\Download',
  "$env:USERPROFILE\Downloads",
  "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
  "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache",
  "$env:LOCALAPPDATA\Google\AndroidStudio2025.3.4",
  "$env:LOCALAPPDATA\Google\AndroidStudio2025.3.4\log"
)
foreach ($p in $paths) {
  if (Test-Path $p) {
    $s = (Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $s) { $s = 0 }
    "{0,10:N2} GB  {1}" -f ([math]::Round($s/1GB,2)), $p
  } else {
    "         --  $p  (not present)"
  }
}
""
"Free space now:"
Get-PSDrive -Name C | Select-Object @{n='FreeGB';e={[math]::Round($_.Free/1GB,2)}}
