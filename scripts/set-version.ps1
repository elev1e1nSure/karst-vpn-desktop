param(
    [Parameter(Mandatory)]
    [string]$Version
)

$cargoTomlPath = "$PSScriptRoot/../src-tauri/Cargo.toml"
(Get-Content $cargoTomlPath -Raw) -replace 'version\s*=\s*".+?"', "version = `"$Version`"" | Set-Content -NoNewline -LiteralPath $cargoTomlPath

Write-Output "Set version $Version in Cargo.toml"
