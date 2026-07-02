param(
  [string]$TargetRoot = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot "package.json") | ConvertFrom-Json
$tauriConfig = Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($TargetRoot)) {
  $TargetRoot = Join-Path $ProjectRoot "src-tauri\target\release"
}

$TargetRoot = Resolve-Path $TargetRoot
$exePath = Join-Path $TargetRoot "mysql-sample-export.exe"
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Portable package failed: executable not found at $exePath. Run npm run tauri:build first."
}

$arch = "x64"
if ($TargetRoot.Path -match "aarch64-pc-windows-msvc") {
  $arch = "arm64"
} elseif ($TargetRoot.Path -match "i686-pc-windows-msvc") {
  $arch = "x86"
}

$productName = $tauriConfig.productName
$version = $packageJson.version
$bundleDir = Join-Path $TargetRoot "bundle\portable"
$stagingRoot = Join-Path $TargetRoot "portable-staging"
$stagingDir = Join-Path $stagingRoot $productName
$zipPath = Join-Path $bundleDir ("{0}_{1}_{2}-Portable.zip" -f $productName, $version, $arch)

if ((Test-Path -LiteralPath $stagingRoot) -and ((Resolve-Path $stagingRoot).Path -like (Join-Path $TargetRoot "*").Replace("[", "``[").Replace("]", "``]"))) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null
Copy-Item -LiteralPath $exePath -Destination (Join-Path $stagingDir (Split-Path $exePath -Leaf)) -Force

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Portable bundle created: $zipPath"