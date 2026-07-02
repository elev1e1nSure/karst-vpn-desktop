_default:
    @just --list

set shell := ["pwsh", "-NoLogo", "-Command"]

# Run the app in dev mode (Rust backend + WebView, hot-reload)
dev:
    npm run tauri dev

# Sync version across package.json/Cargo.toml/tauri.conf.json, then build the release bundle
build:
    @just sync-version
    npm run tauri build

# Bump version everywhere and sync it (e.g. just set-version 0.2.0)
set-version VERSION:
    @pwsh -NoProfile -File scripts/set-version.ps1 -Version "{{VERSION}}"
    @pwsh -NoProfile -File scripts/sync-version.ps1

# Sync version from package.json into Cargo.toml/tauri.conf.json without bumping it
sync-version:
    @pwsh -NoProfile -File scripts/sync-version.ps1

# Full release pipeline used by CI — sync version, build installer
ci-build:
    @pwsh -NoProfile -File scripts/sync-version.ps1
    npm run tauri build
