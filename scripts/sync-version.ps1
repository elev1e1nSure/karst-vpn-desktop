param(
    [string]$Version
)

if (-not $Version) {
    $envVersion = $env:VERSION
    if ($envVersion) {
        $Version = $envVersion
    }
    else {
        $cargoToml = Get-Content "$PSScriptRoot/../src-tauri/Cargo.toml" -Raw
        if ($cargoToml -match 'version\s*=\s*"(.+?)"') {
            $Version = $Matches[1]
        }
    }
}

if (-not $Version) {
    Write-Error "Version not found in Cargo.toml or VERSION env var"
    exit 1
}

$versionPattern = '("version"\s*:\s*")[^"]+'

$tauriConfPath = "$PSScriptRoot/../src-tauri/tauri.conf.json"
$tauriConf = Get-Content $tauriConfPath -Raw
$tauriConf = $tauriConf -replace $versionPattern, "`${1}$Version"
Set-Content -NoNewline -LiteralPath $tauriConfPath -Value $tauriConf

$packageJsonPath = "$PSScriptRoot/../package.json"
$packageJson = Get-Content $packageJsonPath -Raw
$packageJson = $packageJson -replace $versionPattern, "`${1}$Version"
Set-Content -NoNewline -LiteralPath $packageJsonPath -Value $packageJson

Write-Output "Synced version $Version"
