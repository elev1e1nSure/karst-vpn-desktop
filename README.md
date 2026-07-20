# Karst VPN (Desktop)

<p align="center">
  <img src="https://img.shields.io/github/v/release/elev1e1nSure/karst-vpn-desktop?label=release" alt="Release">
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white" alt="Platform">
  <img src="https://github.com/elev1e1nSure/karst-vpn-desktop/actions/workflows/release.yml/badge.svg" alt="Build">
</p>

Karst — приложение для подключения к VLESS-серверам и подпискам на Windows. Добавляешь ссылку/подписку, выбираешь сервер из списка и подключаешься через системный TUN-туннель на sing-box. Подписки обновляются автоматически, есть проверка задержки серверов и три режима маршрутизации.

Десктопная версия [Karst VPN для Android](https://github.com/elev1e1nSure/karst-vpn). Также есть [лендинг](https://github.com/elev1e1nSure/karst-site).

## Установка

Установщик `.exe` доступен в [Releases](https://github.com/elev1e1nSure/karst-vpn-desktop/releases)

## Разработка

```bash
pnpm install
just dev
```

Требуется Rust toolchain и Node.js. Подробнее об архитектуре — в [CLAUDE.md](./CLAUDE.md).

## Сборка релиза

```bash
just set-version 0.2.0
just build
```

Push тега `v*` запускает GitHub Actions, которая собирает Windows-инсталлятор и публикует его в Releases (см. `.github/workflows/release.yml`).
