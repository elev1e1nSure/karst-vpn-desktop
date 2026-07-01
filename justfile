set-version VERSION:
    @pwsh -NoProfile -File scripts/set-version.ps1 -Version "{{VERSION}}"
    @pwsh -NoProfile -File scripts/sync-version.ps1

sync-version:
    @pwsh -NoProfile -File scripts/sync-version.ps1

build:
    @just sync-version
    npm run tauri build

dev:
    npm run tauri dev

ci-build:
    @pwsh -NoProfile -File scripts/sync-version.ps1
    npm run tauri build
