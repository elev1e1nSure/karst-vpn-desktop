# CLAUDE.md

Instructions for the AI agent in this repo. Keep this file short and specific: only project context useful in every session.

## Project

Karst VPN (desktop) — Tauri 2 app in React/TypeScript + Rust, Windows-first. Imports VLESS links and subscriptions, stores servers in SQLite, builds a sing-box config, and brings up a system-wide VPN via a TUN sidecar process. Desktop counterpart of [Karst VPN for Android](https://github.com/elev1e1nSure/karst-vpn).

Key areas:

- `src/App.tsx` — the entire frontend: types, all UI components, view-model transforms (`serverToUi`, `buildGroups`). No router, no global state lib — plain `useState` in the top-level `App` component. Talks to the backend only via Tauri `invoke()`.
- `src/main.tsx` — entry point; also where the Windows flag-emoji font polyfill is wired in (see Code notes below).
- `src-tauri/src/commands/` — one file per Tauri command group (`connection`, `servers`, `subscriptions`, `settings`, `logs`), registered in `lib.rs`'s `generate_handler!`.
- `src-tauri/src/connection/manager.rs` — `ConnectionManager`, single source of truth for connect/disconnect state; serializes connect/disconnect through an internal operation lock.
- `src-tauri/src/singbox/` — builds the sing-box JSON config (`config.rs`, `outbound.rs`, `route_rules.rs`) and spawns/monitors/kills the `sing-box` sidecar (`process.rs`) via `tauri_plugin_shell`.
- `src-tauri/src/subscription/` — fetch → base64-decode → parse VLESS links → replace servers for that subscription in one DB transaction (`refresh.rs`).
- `src-tauri/src/vless/` — hand-rolled VLESS URI parser (`parser.rs`) and link model (`model.rs`).
- `src-tauri/src/db/` — raw `rusqlite`, no ORM; `schema.rs` runs idempotent `CREATE TABLE IF NOT EXISTS` migrations.
- `src-tauri/src/scheduler.rs` — background task that periodically refreshes subscriptions per `AutoRefreshMode` (Off/Auto/EveryHours).
- `src-tauri/src/error.rs` — single `AppError` enum for the whole backend; serializes to `{ kind, message }` for the frontend.
- `src-tauri/binaries/` — checked-in `sing-box` sidecar exe + `wintun.dll`, required for `tauri dev`/`tauri build` to work.

## Commands

```bash
npm install
just dev              # npm run tauri dev — full app, hot-reload
just build             # sync-version + npm run tauri build — release installer
just set-version X.Y.Z  # bump version across package.json/Cargo.toml/tauri.conf.json
```

Rust backend only (run from `src-tauri/`): `cargo check`, `cargo build`, `cargo clippy`.

There are no automated tests in this repo (frontend or backend).

Release signing/CI: push tag `v*` → GitHub Actions (`.github/workflows/release.yml`) syncs the version, builds the Windows installer (msi + nsis), and uploads it to the GitHub Release.

## Code

- Follow the existing React/TypeScript and Rust project style.
- Comments in English only, and only for non-obvious decisions or constraints.
- Do not add secrets, real VLESS links, subscriptions, tokens, or private endpoints to the repo.
- Do not touch `src-tauri/binaries/` (sing-box sidecar, wintun.dll) unless the task involves upgrading sing-box.
- Server names run through `emojifyName`/`countryCodeToFlag` in `App.tsx` to turn a leading country code into a flag emoji. Windows/WebView2 doesn't render flag-emoji ligatures natively — `main.tsx` polyfills this with a **locally bundled** font (`src/assets/fonts/TwemojiCountryFlags.woff2`), not the polyfill package's default CDN URL, since the app can't assume network access before a VPN connection exists. Any inline style that renders a flag-bearing string needs `"Twemoji Country Flags"` prefixed onto its `font-family`.
- `src-tauri/capabilities/default.json` allowlists executing the sing-box sidecar with arbitrary args — required for `SingboxProcess::spawn`; don't broaden it further than necessary.
- Keep the UI calm and minimal. Do not add decorative elements without a task.

## Verification

- For frontend changes, `npm run build` (tsc + vite) must pass.
- For backend changes, `cargo check` in `src-tauri/` must pass.
- A successful build does **not** prove the VPN connection actually works — for changes touching `connection/`, `singbox/`, or routing, explicitly state that manual testing via `just dev` on Windows is required.

## Git

- One logically complete user request — one commit.
- Commit message format: `type(scope): description`.
- Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`.
- Do not roll back others' changes without an explicit request.
