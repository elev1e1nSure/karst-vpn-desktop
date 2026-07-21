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
XHTTP умеет H3/QUIC через `finalmask.quicParams` — для VLESS в sing-box такого нет вообще.

## 2a. Сверено с официальной документацией

Проверено через context7 21.07.2026. Что подтвердилось и что изменилось.

### Версия sing-box в репо — 1.13.14

Свежая. Новый формат DNS (`action: "route"`, `type: "https"`), уже используемый
в `src-tauri/src/singbox/config.rs`, валиден. Доподнимать ядро не нужно.

### Xray переименовал ключ транспорта: `network` → `method`

Актуальная схема `streamSettings`:

```json
"streamSettings": {
  "method": "raw",
  "rawSettings": {},
  "xhttpSettings": {},
  "kcpSettings": {},
  "grpcSettings": {},
  "wsSettings": {},
  "httpupgradeSettings": {},
  "hysteriaSettings": {},
  "security": "none",
  "realitySettings": {},
  "tlsSettings": {},
  "finalmask": {},
  "sockopt": {}
}
```

Транспорт `tcp` переименован в `raw` (`tcpSettings` → `rawSettings`).
Английская версия доки ещё показывает `network` — значит это legacy-алиас, оба ключа работают.
Транспорт `h2` / `httpSettings` из списка пропал совсем: актуальный набор —
RAW, XHTTP, mKCP, gRPC, WebSocket, HTTPUpgrade, Hysteria.

**Открытый риск:** `method` / `raw` / `finalmask` / `hysteriaSettings` выглядят как ветка v26.x.
В v25.x, вероятно, ещё `network` / `tcpSettings`. Поэтому **версия Xray фиксируется до написания
генератора конфига** (см. 3.1), иначе получим код под доку, которой бинарь не соответствует.

### `process_name` на Windows поддерживается

Прямо задокументировано: process-matching (`process_name`, `process_path`, `process_path_regex`)
работает на Linux, Windows и macOS. Анти-петля из 3.5 реализуема.

Бонус: то же поле есть **и в DNS-правилах**, не только в route. DNS-запросы самого xray
заворачиваются на `local-dns` одним правилом, поэтому подстановка резолвнутого IP (3.5.3)
становится подстраховкой, а не обязательным пунктом.

### Схемы подтвердились дословно

sing-box socks outbound:

```json
{ "type": "socks", "tag": "socks-out", "server": "127.0.0.1",
  "server_port": 1080, "version": "5", "udp_over_tcp": false }
```

Поле `network` у socks-outbound **не указывать**: оно сужает outbound до одного протокола
(`"udp"` = только UDP). Нужны оба — значит ключ опускаем.

Xray socks inbound:

```json
{ "protocol": "socks",
  "settings": { "auth": "noauth", "udp": true, "ip": "127.0.0.1" } }
```

Поле `ip` — локальный IP для UDP-ассоциации; для localhost-цепочки `127.0.0.1` корректно.

### Что ещё не проверено

- **Полный список полей `xhttpSettings`** (`mode`, `extra`, `xmux`, `downloadSettings`) —
  context7 отдал только факт существования объекта. Достать напрямую
  с `xtls.github.io/en/config/transports/xhttp.html` до начала 3.6. Гадать нельзя.
- **Диалект share-link для xhttp** — спецификация неофициальная, панели кодируют по-разному
  (`mode`, `extra` как URL-encoded JSON, `host` vs `sni`). Нужна живая ссылка с целевой панели.
- Точная форма route-правила с `process_name` в 1.13, формат `log` у Xray, `freedom` + `domainStrategy`.

### Побочная находка: баг в существующем коде (вне рамок задачи)

`src-tauri/src/vless/xray_json.rs:57` читает только `streamSettings.network`. Панель, отдающая
конфиг в новом формате (`"method": "xhttp"`), молча импортируется как `tcp` — сервер сохраняется
с неправильным транспортом.

Фикс тривиальный: `s.get("method").or_else(|| s.get("network"))` плюс маппинг `raw` → `tcp`.
Делать отдельным коммитом до основной работы — он самостоятелен и чинит уже существующий импорт.

## 3. Этапы

### 3.0. Фикс импорта xray-JSON — 0.5 часа

Отдельный коммит до основной работы: `xray_json.rs` должен понимать `method` наравне с `network`
и маппить `raw` → `tcp`. Самостоятельный фикс существующего бага, от остального плана не зависит.

### 3.1. Sidecar и сборка — 0.5 дня

**Первым делом фиксируется версия Xray** (v25.x или v26.x) — от неё зависит,
писать генератор конфига под `method`/`rawSettings` или под `network`/`tcpSettings`.
Дефолт — последний стабильный v26.x.

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

Лечение:

1. route rule `{"process_name": ["xray.exe"], "action": "route", "outbound": "direct"}`
   — подтверждено, что process-matching работает на Windows;
2. DNS rule с тем же `process_name` → `server: "local-dns"`, чтобы резолв самого xray
   не уходил в туннель (`process_name` доступен и в DNS-правилах);
3. подстраховка: резолвить хост сервера в Rust до старта (в `connect_inner` уже есть `tcp_check`,
   `manager.rs:115`) и класть IP в `ip_cidr`-direct правило.

Пункт 3 нужен только если 1–2 окажется недостаточно на практике.
Единственное место, где ловится «подключилось, но интернета нет». Проверяется только вручную.

### 3.6. Парсер и модель — 0.5 дня

**Блокер:** до старта нужны точная схема `xhttpSettings` и живая xhttp-ссылка с целевой панели
(см. «Что ещё не проверено»). Поля модели ниже — предварительные.

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
| 3.0 Фикс импорта xray-JSON | 0.5 часа |
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

Начинать с 3.0 (самостоятельный фикс), затем 3.1 + 3.2 — фундамент, ничего не ломает.

Этап 3.6 заблокирован до получения входных данных ниже; остальные этапы от них не зависят.

## 7. Входные данные, которых не хватает

Достаётся из открытых доков (делаю сам):

- полная схема `xhttpSettings` — `xtls.github.io/en/config/transports/xhttp.html`;
- точная форма route-правила с `process_name` в sing-box 1.13;
- `freedom` outbound + `domainStrategy`, формат `log` у Xray;
- в какой версии Xray появился `method` / `rawSettings`.

Нужно от владельца проекта:

1. **Живая xhttp-ссылка с целевой панели** (в переписку, не в репозиторий; UUID и хост замазать —
   нужны только query-параметры). Спецификация share-link неофициальная, панели кодируют
   `mode` / `extra` / `host` по-разному.
2. **Тип панели** (3x-ui / Marzban / иное) — определяет диалект ссылок и формат подписки.
3. **Версия Xray для бандла** — см. 3.1.
