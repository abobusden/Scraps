# RustLand — 3D-выживание от 1-го лица (Three.js + Node.js + SQLite)

## Запуск
```bash
npm install
cp .env.example .env      # задайте PORT и длинный JWT_SECRET
npm start
```
Откройте http://localhost:3000. Нужен Node.js 18+ (для `better-sqlite3` потребуется готовый бинарник или сборочные инструменты).
Three.js и socket.io-client подгружаются с CDN (unpkg / cdn.socket.io) — нужен интернет в браузере.

## Тест на телефоне
Телефон и ПК в одной Wi-Fi сети → откройте `http://<IP-компьютера>:3000` (IP: `ipconfig` / `ip a`). Поверните телефон горизонтально.
Тач-управление включается автоматически (или в Настройках → Управление → «Мобильный»).

## Структура
```
server/  index.js db.js auth.js game.js commands.js admin.js shop.js  (+ data/game.db, uploads/ создаются сами)
shared/  worldgen.mjs      — генерация острова (общая для сервера и клиента)
client/  index.html style.css recipes.json (предметы, рецепты, бой, постройки — единый источник данных)
         js/ main menu auth game player world inventory craft chat commands input mobile-controls
             network ui audio shop skins cases data
         assets/{models,sounds,icons}  — сюда класть свои файлы
```

## Сервер
Один общий «Официальный сервер #1». Лимит онлайна — 30 игроков (`MAX_PLAYERS` в `.env`, по умолчанию 30; админы лимит обходят). Кнопка «Играть» → карточка сервера со счётчиком `(онлайн/30)`, который обновляется каждые 3 с через `GET /api/info`; при заполненном сервере вход отклоняется с сообщением «Сервер переполнен».

## Админ ADAM
В `server/db.js` функция `ensureAdmin()` при каждом старте проверяет наличие логина `ADAM`; если его нет — создаёт
(`Denis120`, bcrypt-хеш, `isAdmin=1`), если есть — ничего не делает. Админ обходит rate-limit, мут, фильтры,
проверки зон шкафа и лимиты построек.

## Команды (вводятся в тот же чат)
Сообщение с `/` уходит событием `command:execute` только на сервер, другие игроки его не видят, ответ приходит автору
(`chat:system` с `private:true`). Исключения, видимые всем: `/say`, `/broadcast`, `/me`. Tab / тап — автодополнение,
кнопка «Команды» в чате показывает список. Полный список — `/help`.

## Fly / Noclip / God (только админ)
`/fly`, `/noclip` (включает fly, выключение выталкивает из стен), `/god`, `/adminoff`. Флаги хранятся в памяти сервера
(`player.flags`), при выходе сбрасываются, каждое переключение пишется в `admin_logs`. Fly: Space вверх, Ctrl/Shift вниз.
В HUD сверху — ✈️ FLY / 👻 NOCLIP (красным) / 🛡️ GOD. God: нет урона и не тратятся голод/жажда.

## Мультитач (`mobile-controls.js`)
`Map<touchId,{type}>`, type: `joystick | camera | button | ui | sprint`. Левая половина — плавающий джойстик (радиус 80 px),
второй палец слева = бег; правая половина — свайп камеры (отдельный id); кнопки не блокируют камеру; тапы по панелям
(`.gamepanel`, модалки, хотбар) = `ui`, не вызывают preventDefault и скроллятся. Сброс при `blur`, `visibilitychange`,
`touchcancel`. Весь ввод идёт через `Input.getMoveVector()`, `getLookDelta()`, `isActionPressed()`.

## Мультивкладки
- Сервер держит одну сессию на аккаунт: при `join` из новой вкладки старый сокет получает `session:replaced`
  (модалка «Сессия открыта в другой вкладке» + «Вернуться в меню») и отключается.
- `BroadcastChannel('rustland')`: синхронизация настроек между вкладками и дедупликация чата по `messageId`.
- Звук играет только в видимой вкладке (`document.visibilityState`).

## Модели и звуки
Сейчас всё процедурное (деревья, камни, руки, оружие, игроки — детализированные меши с шумом и плоскими гранями),
звуки синтезируются WebAudio, иконки — эмодзи. Чтобы подключить свои файлы:
- GLB: Quaternius (quaternius.com), Kenney (kenney.nl), Mixamo (mixamo.com) → `client/assets/models/`
- Звуки: freesound.org, Kenney Audio, OpenGameArt → `client/assets/sounds/`; в коде `loadFile('chop','/assets/sounds/chop.ogg')` из `audio.js` заменит синтез
- Иконки 64×64 PNG → `client/assets/icons/<item_id>.png` (id — ключи в `recipes.json`)

## Валюта магазина
Скрап в магазине — баланс аккаунта (`users.scrap`, старт 1000), отдельный от скрапа-предмета в игре.
Награды кейсов: скрап — на баланс, металл/оружие — в `pending_items`, выдаются при следующем входе в игру.
