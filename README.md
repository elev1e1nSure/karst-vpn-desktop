# Karst VPN (Desktop)

<p align="center">
  <img src="https://img.shields.io/github/v/release/elev1e1nSure/karst-vpn-desktop?label=release" alt="Release">
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white" alt="Platform">
  <img src="https://github.com/elev1e1nSure/karst-vpn-desktop/actions/workflows/release.yml/badge.svg" alt="Build">
</p>

Karst — VPN-клиент для Windows с поддержкой VLESS-протокола. Добавляешь ссылку или подписку, выбираешь сервер, подключаешься через системный TUN-туннель на sing-box.

Десктопная версия [Karst VPN для Android](https://github.com/elev1e1nSure/karst-vpn). Лендинг — [karst-site](https://github.com/elev1e1nSure/karst-site).

## Фичи

- **VLESS-ссылки** — импорт одиночных ссылок и подписок
- **Подписки** — автообновление по расписанию (оффлайн, при запуске, каждый N часов), раз в сессию
- **Серверы** — ручной и автоматический (из подписок), группировка по подпискам, проверка задержки (TCP ping)
- **Маршрутизация** — 3 режима: прокси весь трафик, только локальный (bypass LAN), правило по умолчанию (default-route из конфига)
- **TUN-туннель** — системный виртуальный адаптер через sing-box sidecar, автоочистка при падении
- **Системный трей** — сворачивание в трей, quit через меню
- **Логи** — структурированное логирование в файл, просмотр в приложении
- **DNS** — настраиваемый DoH-резолвер
- **Single instance** — только один экземпляр приложения

## Установка

Установщик `.exe` — в [Releases](https://github.com/elev1e1nSure/karst-vpn-desktop/releases).

Требования: Windows 10+, [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/).

## Разработка

```bash
pnpm install
just dev
```

Требуется Rust toolchain и Node.js. Архитектура — в [CLAUDE.md](./CLAUDE.md).

Проверка:
```bash
just check
```

## Сборка релиза

```bash
just set-version 1.2.3
just build
```

Push тега `v*` запускает CI, которая собирает MSI + NSIS установщики и публикует в Releases.
