# План: второе ядро — Xray (поддержка XHTTP)

Статус: черновик, ожидает утверждения. Код не менялся.

## 1. Определяющий факт

**Xray не умеет TUN.** У него только inbound-ы (socks/http/dokodemo). Системный VPN он сам не поднимет.
sing-box в проекте держит TUN + `auto_route` + routing rules + DNS DoH + bypass-RU — заменить это нечем.

Вывод: **sing-box остаётся, но меняет роль.** Не «одно ядро вместо другого», а два слоя:

```
TUN (sing-box)  ->  route/DNS/bypass (sing-box)  ->  outbound socks 127.0.0.1:P
                                                              |
                                                     xray socks inbound
                                                              |
                                                   vless + xhttp -> сервер
```

Схема v2rayN/Nekoray. Оверхед — один localhost-хоп, ~30–60 MB RAM.

Отклонённая альтернатива: выкинуть sing-box, взять xray + свой tun2socks (hev-socks5-tunnel / wintun).
Это заново писать TUN-слой, routing и DNS-логику. Хуже по всем осям.

## 2. Зачем xhttp

sing-box его не поддерживает и не будет — мейнтейнер отказался от XHTTP принципиально.
При `type=xhttp` парсер сейчас честно роняет ссылку (`src-tauri/src/vless/parser.rs:138`, `UnsupportedTransport`).
Выбора нет: только xray.

Эксклюзив xray помимо xhttp: VLESS Encryption (post-quantum ML-KEM), новые режимы Vision, fragment/noise.

## 3. Этапы

### 3.1. Sidecar и сборка — 0.5 дня

- `src-tauri/binaries/xray-x86_64-pc-windows-msvc.exe`
- `externalBin` в `src-tauri/tauri.conf.json:38`
- второй блок `shell:allow-execute` в `src-tauri/capabilities/default.json`
- `src-tauri/build.rs:5-27` — обобщить подсчёт хеша, добавить `XRAY_SHA256`
- `verify_sidecar` (`src-tauri/src/singbox/process.rs:298`) — параметризовать именем бинаря

geoip/geosite.dat **не нужны**: весь роутинг остаётся в sing-box, конфиг xray = «socks in → vless out → freedom».

Минус: репозиторий вырастет примерно на 35 MB.

### 3.2. Обобщение процесс-слоя — 1 день

`src-tauri/src/singbox/process.rs` жёстко зашит под sing-box: имя лога, PID-файл,
маркер готовности `"sing-box started"`, тексты ошибок, `AppError::Singbox`.

Нужен `SidecarProcess { bin_name, args, log_file, pid_file, ready_probe }`.

Ready-проба различается:

- sing-box — маркер в stdout (как сейчас),
- xray — TCP-poll socks-порта (надёжнее, лог xray менее предсказуем).

`process_guard.rs:115` `is_expected_singbox_executable` — список допустимых имён делается параметром.
`recover_stale_process` вызывается для обоих PID-файлов.

Структура каталогов: `singbox/` → `core/` с `core/singbox/`, `core/xray/`, общим `core/process.rs`.

### 3.3. Конфиги — 1 день

- `core/xray/config.rs`: socks inbound `127.0.0.1:P`, `{"udp": true, "auth": "noauth"}`, outbound vless + freedom.
- `core/xray/outbound.rs`: `VlessLink` → xray `streamSettings`. Зеркало существующего
  `src-tauri/src/vless/xray_json.rs` (тот парсит xray-JSON → URI, здесь обратное направление).
- `src-tauri/src/singbox/config.rs:54`: в режиме xray outbound `proxy` становится
  `{"type":"socks","server":"127.0.0.1","server_port":P,"version":"5"}`.
  Остальной конфиг (TUN, DNS, route rules) не трогается.

### 3.4. Порядок запуска

xray → ready → sing-box → ready. Остановка в обратном порядке.

`ConnectionManager.inner.process` (`src-tauri/src/connection/manager.rs:41`) становится структурой
из двух опциональных процессов. `monitor_exit` слушает оба: падение любого = разрыв соединения.

Порт: bind на `127.0.0.1:0`, узнать номер, отпустить, передать обоим. TOCTOU-риск мизерный.

### 3.5. Анти-петля маршрутизации — 0.5 дня + отладка вживую

**Главная ловушка.** sing-box с `auto_route` перехватывает весь трафик машины, включая исходящий
трафик xray к VPS. Себе sing-box петлю не делает (`auto_detect_interface`), но xray — чужой процесс,
его пакеты уйдут в TUN → бесконечный цикл.

Лечение, делать всё сразу:

1. route rule `{"process_name": "xray.exe", "outbound": "direct"}`;
2. резолвить хост сервера в Rust до старта (в `connect_inner` уже есть `tcp_check`,
   `manager.rs:115`) и класть IP в `ip_cidr`-direct правило;
3. в xray outbound подставлять уже резолвнутый IP, сохраняя `serverName` / Host-header из ссылки —
   иначе DNS-запрос самого xray полезет через TUN.

Единственное место, где ловится «подключилось, но интернета нет». Проверяется только вручную.

### 3.6. Парсер и модель — 0.5 дня

- `Transport::Xhttp { host, path, mode, extra }` в `src-tauri/src/vless/model.rs:34`
- `parser.rs:138` — вместо ошибки нормальный разбор (`path`, `host`, `mode`, `extra` сырым JSON)
- `src-tauri/src/singbox/outbound.rs:89` — `Transport::Xhttp` возвращает ошибку «требуется xray»

Транспорт становится жёстким признаком требуемого ядра.

### 3.7. Выбор ядра (UX) — 0.5 дня

**Настройки → Ядро: Авто (по умолчанию) / sing-box / Xray**

- **Авто**: xhttp → xray, всё остальное → sing-box. Юзер ничего не настраивает,
  xhttp-подписки просто начинают работать.
- **Xray**: гонит всё через xray (тест стабильности на ws/grpc/reality).
- **sing-box**: старое поведение, серверы с xhttp помечаются как несовместимые.

Плюс бейдж ядра в карточке сервера.

**Решено: выбор ядра глобальный.** Пер-серверный override (колонка `core` в таблице `servers`)
не делаем — он добавляется поверх позже без ломки, глобальная настройка просто становится
дефолтом для `NULL`. Отдельная причина не спешить: подписка перезаписывает серверы транзакцией
(`src-tauri/src/subscription/refresh.rs`), поэтому пер-серверный override пришлось бы сохранять
по ключу (uri или host+port), иначе он слетал бы при каждом рефреше.

DB: один ключ `core_mode` в settings, миграция не нужна — таблица key-value
(`src-tauri/src/db/settings.rs:25`).

### 3.8. Логи

`app_log::Category::Core` уже есть. Разнести на два файла (`sing-box.log`, `xray.log`),
префиксовать строки именем ядра, в `LogsScreen` добавить фильтр по ядру.

## 4. Оценка

| Этап | Время |
| --- | --- |
| 3.1 Sidecar + сборка + чексуммы | 0.5 дня |
| 3.2 Обобщение process/guard | 1 день |
| 3.3 xray config/outbound + socks-чейнинг | 1 день |
| 3.4–3.5 Порядок запуска + анти-петля | 0.5 дня |
| 3.6 xhttp парсер/модель | 0.5 дня |
| 3.7–3.8 Настройки + UI + логи | 0.5 дня |

**Итого ~4 дня.** Риск-зона одна — 3.5. Остальное механика.

## 5. Верификация

`just check` докажет только компиляцию. Реальная проверка — ручная:

- `just dev` на Windows под админом;
- настоящий xhttp-сервер;
- отдельно UDP (QUIC / игры) через socks5-цепочку;
- проверка, что при `Авто` обычные reality/ws-серверы по-прежнему идут через sing-box без регрессий.

## 6. Порядок реализации

Начинать с 3.1 + 3.2 — фундамент, ничего не ломает.

Открытых вопросов нет.
