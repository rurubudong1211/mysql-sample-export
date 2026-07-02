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
$msiDir = Join-Path $TargetRoot "bundle\msi"
if (-not (Test-Path -LiteralPath $msiDir)) {
  throw "MSI normalize failed: bundle directory not found at $msiDir. Run tauri build --bundles msi first."
}

$arch = "x64"
if ($TargetRoot.Path -match "aarch64-pc-windows-msvc") {
  $arch = "arm64"
} elseif ($TargetRoot.Path -match "i686-pc-windows-msvc") {
  $arch = "x86"
}

$productName = $tauriConfig.productName
$version = $packageJson.version
$sourceName = "{0}_{1}_{2}_zh-CN.msi" -f $productName, $version, $arch
$targetName = "{0}_{1}_{2}.msi" -f $productName, $version, $arch
$sourcePath = Join-Path $msiDir $sourceName
$targetPath = Join-Path $msiDir $targetName

if (-not (Test-Path -LiteralPath $sourcePath)) {
  $source = Get-ChildItem -LiteralPath $msiDir -Filter ("{0}_{1}_{2}_*.msi" -f $productName, $version, $arch) |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($null -eq $source) {
    throw "MSI normalize failed: no localized MSI found in $msiDir."
  }
  $sourcePath = $source.FullName
}

if ((Test-Path -LiteralPath $targetPath) -and ((Resolve-Path $targetPath).Path -ne (Resolve-Path $sourcePath).Path)) {
  Remove-Item -LiteralPath $targetPath -Force
}

if ((Split-Path -Leaf $sourcePath) -ne $targetName) {
  Move-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

Write-Host "MSI renamed: $targetPath"