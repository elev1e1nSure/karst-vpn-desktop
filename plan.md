# План: второе ядро — Xray (поддержка XHTTP)

Статус: все этапы (3.0–3.8) реализованы. Осталось живое тестирование на Windows —
см. раздел 5. До прогона считать фичу непроверенной.

Обе половины конфига проверены статически прогоном через сами бинари:
`xray run -test -c` → `Configuration OK`, `sing-box check -c` → exit 0. Правило `process_name`
принимается sing-box 1.13.14 и в route-, и в DNS-правилах.

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

### Версия Xray: v26.3.27 — последняя стабильная

Все релизы после (v26.4.x … v26.7.11) помечены prerelease. Бандлим `Xray-windows-64.zip` из v26.3.27.

### Ключ транспорта — `network`, НЕ `method`

Сверено по исходникам на теге v26.3.27 (`infra/conf/transport_internet.go`), не по доке.
**Вхождений `"method"` в файле ровно 0** — этот ключ появился уже после марта, в prerelease-ветке.
Сайт документации опережает стабильный релиз, доверять ему нельзя.

```go
type StreamConfig struct {
    Network             *TransportProtocol `json:"network"`
    Security            string             `json:"security"`
    REALITYSettings     *REALITYConfig     `json:"realitySettings"`
    XHTTPSettings       *SplitHTTPConfig   `json:"xhttpSettings"`
    SplitHTTPSettings   *SplitHTTPConfig   `json:"splithttpSettings"` // legacy-алиас
    RAWSettings         *TCPConfig         `json:"rawSettings"`
    TCPSettings         *TCPConfig         `json:"tcpSettings"`       // legacy-алиас
    ...
}
```

Из `TransportProtocol.Build()`:

- `raw` == `tcp`, `xhttp` == `splithttp`, `kcp` == `mkcp` — алиасы;
- `h2` / `http` / `quic` — **удалены**, возвращают ошибку (`PrintRemovedFeatureError`);
- `ws` / `grpc` / `httpupgrade` — работают, но печатают deprecation-варнинг.

Следствие: `Transport::Http` (`vless/model.rs`) при xray-ядре собрать нельзя — обрабатывать
как несовместимый транспорт, наравне с обратной ситуацией у xhttp в sing-box.

### Семантика `extra` в xhttpSettings — неочевидная

```go
func (c *SplitHTTPConfig) Build() (proto.Message, error) {
    if c.Extra != nil {
        var extra SplitHTTPConfig
        json.Unmarshal(c.Extra, &extra)
        extra.Host = c.Host
        extra.Path = c.Path
        extra.Mode = c.Mode
        c = &extra          // весь остальной внешний конфиг выбрасывается
    }
```

Если `extra` задан, он **заменяет собой весь `xhttpSettings`**; снаружи выживают только
`host`, `path`, `mode`.

Практический вывод: `extra` из ссылки прокидывается verbatim, `host`/`path`/`mode` ставятся
снаружи, а плоские дубликаты вроде `x_padding_bytes` из ссылки **игнорируются** — они всё равно
были бы затёрты, а их значения уже продублированы внутри `extra`.

`mode`: `""` → `auto`; допустимые — `auto`, `packet-up`, `stream-up`, `stream-one`.

Полный набор полей `SplitHTTPConfig` (v26.3.27): `host`, `path`, `mode`, `headers`,
`xPaddingBytes`, `xPaddingObfsMode`, `xPaddingKey`, `xPaddingHeader`, `xPaddingPlacement`,
`xPaddingMethod`, `uplinkHTTPMethod`, `sessionPlacement`, `sessionKey`, `seqPlacement`, `seqKey`,
`uplinkDataPlacement`, `uplinkDataKey`, `uplinkChunkSize`, `noGRPCHeader`, `noSSEHeader`,
`scMaxEachPostBytes`, `scMinPostsIntervalMs`, `scMaxBufferedPosts`, `scStreamUpServerSecs`,
`serverMaxHeaderBytes`, `xmux`, `downloadSettings`, `extra`.

Нам из них нужны только `host` / `path` / `mode` / `extra`.

### REALITY: поле `spiderX` теряется парсером

`REALITYConfig` (v26.3.27) на клиентской стороне: `serverName`, `fingerprint`, `publicKey`,
`shortId`, `spiderX`, `password`, `mldsa65Verify`.

Ссылки 3x-ui несут `spx=…` — это `spiderX`. Наш парсер (`src-tauri/src/vless/parser.rs:103-115`)
читает только `pbk` / `sid` / `sni` / `fp` и `spx` молча теряет. Для sing-box безвредно
(он spiderX не поддерживает), для xray-ядра поле надо добавить в `Security::Reality`.

### `process_name` на Windows поддерживается

Прямо задокументировано: process-matching (`process_name`, `process_path`, `process_path_regex`)
работает на Linux, Windows и macOS. Анти-петля из 3.5 реализуема.

Бонус: то же поле есть **и в DNS-правилах**, не только в route. DNS-запросы самого xray
заворачиваются на `local-dns` одним правилом, поэтому подстановка резолвнутого IP (3.5.3)
становится подстраховкой, а не обязательным пунктом.

### Схемы подтвердились дословно

sing-box socks outbound:

```json
{
  "type": "socks",
  "tag": "socks-out",
  "server": "127.0.0.1",
  "server_port": 1080,
  "version": "5",
  "udp_over_tcp": false
}
```

Поле `network` у socks-outbound **не указывать**: оно сужает outbound до одного протокола
(`"udp"` = только UDP). Нужны оба — значит ключ опускаем.

Xray socks inbound:

```json
{ "protocol": "socks", "settings": { "auth": "noauth", "udp": true, "ip": "127.0.0.1" } }
```

Поле `ip` — локальный IP для UDP-ассоциации; для localhost-цепочки `127.0.0.1` корректно.

### Диалект share-link у 3x-ui (целевая панель)

Форма ссылки, снятая с тестовой подписки (значения заменены плейсхолдерами):

```
vless://<uuid>@<host>:443
  ?type=xhttp
  &security=reality
  &encryption=none
  &sni=<sni>
  &pbk=<publicKey>
  &sid=<shortId>
  &spx=<spiderX>
  &fp=firefox
  &path=<path>
  &host=                    // пустое значение = поле не задано
  &mode=auto
  &extra=<url-encoded JSON: {"mode":"auto","xPaddingBytes":"100-1000"}>
  &x_padding_bytes=100-1000 // плоский дубликат содержимого extra, игнорируем
#<имя с флаг-эмодзи>
```

Заметки:

- `flow` отсутствует — Vision с xhttp несовместим, это ожидаемо;
- `host=` приходит пустым; текущий `first_non_empty` в парсере уже трактует пустое как `None`;
- имя содержит флаг-эмодзи и проходит через существующий `emojifyName`.

Целевая подписка отдаёт классический base64-список строк `vless://`, а не xray-JSON,
поэтому ветка `xray_json.rs` для неё не задействуется.

### Что ещё не проверено

- Точная форма route-правила с `process_name` в sing-box 1.13.
- Формат `log` у Xray и что он печатает при старте (для 3.2 не критично — ready-проба
  делается TCP-поллом порта).
- `freedom` outbound + `domainStrategy`.

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

Версия зафиксирована: **v26.3.27** (`Xray-windows-64.zip`), генератор конфига пишется под `network`.

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

Целевая форма для xhttp + reality (проверена по исходникам v26.3.27):

```json
"streamSettings": {
  "network": "xhttp",
  "security": "reality",
  "realitySettings": {
    "serverName": "<sni>",
    "fingerprint": "firefox",
    "publicKey": "<pbk>",
    "shortId": "<sid>",
    "spiderX": "<spx>"
  },
  "xhttpSettings": {
    "host": "",
    "path": "<path>",
    "mode": "auto",
    "extra": { "mode": "auto", "xPaddingBytes": "100-1000" }
  }
}
```

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

Блокер снят: схема и диалект ссылок подтверждены (см. 2a).

- `Transport::Xhttp { host, path, mode, extra }` в `src-tauri/src/vless/model.rs:34`,
  где `extra` — сырая JSON-строка, прокидываемая в конфиг без разбора
- `Security::Reality` — добавить `spider_x: Option<String>` (параметр `spx`)
- `parser.rs:138` — вместо ошибки нормальный разбор `type=xhttp`; плоский `x_padding_bytes`
  игнорировать (перекрывается семантикой `extra`)
- `parse_flow` — `flow` с xhttp несовместим, отвергать как `InvalidVisionFlow`
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

| Этап                                     | Время    |
| ---------------------------------------- | -------- |
| 3.0 Фикс импорта xray-JSON               | 0.5 часа |
| 3.1 Sidecar + сборка + чексуммы          | 0.5 дня  |
| 3.2 Обобщение process/guard              | 1 день   |
| 3.3 xray config/outbound + socks-чейнинг | 1 день   |
| 3.4–3.5 Порядок запуска + анти-петля     | 0.5 дня  |
| 3.6 xhttp парсер/модель                  | 0.5 дня  |
| 3.7–3.8 Настройки + UI + логи            | 0.5 дня  |

**Итого ~4 дня.** Риск-зона одна — 3.5. Остальное механика.

## 5. Верификация

`just check` докажет только компиляцию. Реальная проверка — ручная:

- `just dev` на Windows под админом;
- настоящий xhttp-сервер;
- отдельно UDP (QUIC / игры) через socks5-цепочку;
- проверка, что при `Авто` обычные reality/ws-серверы по-прежнему идут через sing-box без регрессий.

## 6. Порядок реализации

Начинать с 3.0 (самостоятельный фикс), затем 3.1 + 3.2 — фундамент, ничего не ломает.

Блокеров нет: версия, схема конфига и диалект ссылок 3x-ui подтверждены по исходникам v26.3.27.

Остаётся ручная зависимость: положить `xray-x86_64-pc-windows-msvc.exe` (v26.3.27)
в `src-tauri/binaries/`.

## 7. Тестовый стенд

Целевая панель — 3x-ui, транспорт xhttp + REALITY, режим `auto`.
Реквизиты тестового сервера в репозиторий не коммитятся.
