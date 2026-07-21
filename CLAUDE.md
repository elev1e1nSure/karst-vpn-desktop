# CLAUDE.md

Instructions for the AI agent in this repo. Keep this file short and specific: only project context useful in every session.

## Project

Karst VPN (desktop) — Tauri 2 app in React/TypeScript + Rust, Windows-first. Imports VLESS links and subscriptions, stores servers in SQLite, builds a sing-box config, and brings up a system-wide VPN via a TUN sidecar process. Desktop counterpart of [Karst VPN for Android](https://github.com/elev1e1nSure/karst-vpn).

Key areas:

- `src/App.tsx` — top-level entry component instantiating `useAppController()` and rendering `AppView`.
- `src/app/` — frontend architecture: state management hook (`useAppController`), layout (`AppView`), Tauri IPC commands (`commands`), domain models/transforms (`models`), presentation helpers (`presentation`), connection status (`useConnectionStatus`), and types (`types`).
- `src/features/` — domain feature components (`connection/`, `servers/` including subscriptions, `settings/`, `logs/`, `diagnostics/`). Each subfolder has a main component + a `use*` hook for state/commands.
- `src/ui/` — shared design system & UI components (`ErrorBoundary`, `Pressable`, `Sidebar`, `Tooltip`, `LogsScreen`, `theme`, `useSheetDrag`).
- `src/main.tsx` — entry point; wires in Windows flag-emoji font polyfill (`TwemojiCountryFlags.woff2`).
- `src-tauri/src/commands/` — one file per Tauri command group (`connection`, `servers`, `subscriptions`, `settings`, `logs`), registered in `lib.rs`'s `generate_handler!`.
- `src-tauri/src/connection/manager.rs` — `ConnectionManager`, single source of truth for connect/disconnect state; serializes connect/disconnect through an internal operation lock. `tunnel.rs` owns the one-or-two sidecar processes making up a live connection.
- `src-tauri/src/core/` — core-agnostic sidecar layer: `SidecarSpec` (per-core binary/config/log/PID names, readiness marker, checksum), `process.rs` (spawn, readiness, teardown), `process_guard.rs` (Windows job objects, stale-PID recovery), and `CoreMode`/`TransportCore` for picking which core handles a transport. `SPECS` is the registry both startup recovery and the log viewer iterate.
- `src-tauri/src/singbox/` — builds sing-box JSON config (`config.rs`, `outbound.rs`, `route_rules.rs`) and declares `singbox::SPEC`. sing-box always runs: it owns TUN, routing and DNS.
- `src-tauri/src/xray/` — optional second core for transports sing-box can't express (notably xhttp). Builds a loopback SOCKS5 inbound plus VLESS outbound (`config.rs`, `outbound.rs`) and declares `xray::SPEC`.
- `src-tauri/src/subscription/` — fetches subscription payload (`fetch.rs`), base64-decodes (`decode.rs`), parses VLESS links, replaces servers for that subscription in one DB transaction (`refresh.rs`).
- `src-tauri/src/vless/` — hand-rolled VLESS URI parser (`parser.rs`), link model (`model.rs`), optional xray-json outbound builder (`xray_json.rs`).
- `src-tauri/src/db/` — raw `rusqlite`, no ORM; schema in `schema.rs` (idempotent migrations, recreates corrupt DB); per-table modules (`servers.rs`, `subscriptions.rs`, `settings.rs`).
- `src-tauri/src/healthcheck.rs` — TCP ping to server address:port for latency measurement.
- `src-tauri/src/app_log.rs` — structured file-based logging with categories, in-app viewer reads from same file.
- `src-tauri/src/dto.rs` — serialization DTOs mapping backend records → frontend types.
- `src-tauri/src/tray.rs` — system tray icon with menu (show window, quit); updates icon on connect/disconnect.
- `src-tauri/src/lifecycle.rs` — close-to-tray, graceful shutdown, force-kill tunnel on exit.
- `src-tauri/src/scheduler.rs` — background task that periodically refreshes subscriptions per `AutoRefreshMode` (Off/Auto/EveryHours).
- `src-tauri/src/error.rs` — single `AppError` enum for the whole backend; serializes to `{ kind, message }` for the frontend.
- `src-tauri/src/lib.rs` — `tauri::Builder` setup: single-instance plugin, DB init, connection manager init, scheduler spawn, tray init, close-to-tray event wiring, invoke handler registration.
- `src-tauri/src/main.rs` — thin binary entrypoint; calls `karst_vpn_lib::run()`.
- `src-tauri/binaries/` — checked-in `sing-box` and `xray` sidecar exes + `wintun.dll`, required for `tauri dev`/`tauri build` to work. `build.rs` hashes both and exposes `SINGBOX_SHA256`/`XRAY_SHA256`.

## Commands

```bash
pnpm install
just dev              # pnpm tauri dev — full app, hot-reload
just check            # pnpm check + cargo fmt/clippy/check — run full lint & typecheck
just build            # sync-version + pnpm tauri build — release installer
just set-version X.Y.Z # bump version across package.json/Cargo.toml/tauri.conf.json
just sync-version     # sync version from package.json into Cargo.toml/tauri.conf.json
just ci-build         # sync version and build release installer for CI
```

Rust backend only (run from `src-tauri/`): `cargo check`, `cargo build`, `cargo clippy`.
Frontend only: `pnpm check` (runs Prettier format check, ESLint, TypeScript typecheck), `pnpm format` (Prettier write).

There are no automated unit tests in this repo (frontend or backend).

Release signing/CI: push tag `v*` → GitHub Actions (`.github/workflows/release.yml`) syncs the version, builds the Windows installer (msi + nsis), and uploads it to the GitHub Release.

## Code

- Follow the existing React/TypeScript and Rust project style.
- Comments in English only, and only for non-obvious decisions or constraints.
- Do not add secrets, real VLESS links, subscriptions, tokens, or private endpoints to the repo.
- Do not touch `src-tauri/binaries/` (sing-box and xray sidecars, wintun.dll) unless the task involves upgrading a core. Xray is pinned to v26.3.27: later releases are prereleases, and its config schema shifts between them (`streamSettings.network` was renamed to `method` after this tag). Verify config keys against the tagged source, not the docs site, which tracks prereleases.
- Server names run through `emojifyName`/`countryCodeToFlag` in `src/app/models.ts` to turn a leading country code into a flag emoji. Windows/WebView2 doesn't render flag-emoji ligatures natively — `main.tsx` polyfills this with a **locally bundled** font (`src/assets/fonts/TwemojiCountryFlags.woff2`), not the polyfill package's default CDN URL, since the app can't assume network access before a VPN connection exists. Any inline style that renders a flag-bearing string needs `"Twemoji Country Flags"` prefixed onto its `font-family`.
- `src-tauri/capabilities/default.json` allowlists executing the sing-box and xray sidecars with arbitrary args — required for `SidecarProcess::spawn`; don't broaden it further than necessary.
- Use `Pressable` for interactive elements to ensure consistent touch ripple feedback across the UI.
- Keep the UI calm and minimal. Do not add decorative elements without a task.

## Verification

- `just check` must pass (runs frontend `pnpm check` + backend `cargo fmt`, `cargo clippy`, `cargo check`).
- For frontend changes, `pnpm check` (or `pnpm build`) must pass.
- For backend changes, `cargo check` and `cargo clippy` in `src-tauri/` must pass.
- A successful build does **not** prove the VPN connection actually works — for changes touching `connection/`, `core/`, `singbox/`, `xray/`, or routing, explicitly state that manual testing via `just dev` on Windows is required.
- Generated core configs can still be checked statically without starting a tunnel: `sing-box check -c <file>` and `xray run -test -c <file>` load the config and exit. Use them instead of trusting a config shape from memory.

## Git

- One logically complete user request — one commit.
- Commit message format: `type(scope): description`.
- Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`.
- Do not roll back others' changes without an explicit request.
