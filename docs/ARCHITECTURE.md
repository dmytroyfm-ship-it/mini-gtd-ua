# Архітектура — Mini GTD UA

Цей документ описує технічний стан проєкту **на поточний момент**.
Оновлюється разом із кодом — якщо стек, структура чи маршрути
змінюються, документ переписується в тому ж кроці, а не «колись
потім».

Правила, за якими побудований і розвивається проєкт, — у
[PROJECT_RULES.md](../PROJECT_RULES.md). Що саме будуємо — у
[PRD.md](PRD.md).

## 1. Технологічний стек

Мінімальний набір, без фреймворків і збірників:

- **HTML** — розмітка (єдина точка входу — `index.html`)
- **CSS** (звичайний, без препроцесорів) — стилі та дизайн-токени
- **JavaScript** (vanilla, ES-модулі, без фреймворків) — поведінка
  сторінки та клієнтська маршрутизація
- **Google Fonts** (Unbounded, Golos Text) — типографіка з
  підтримкою кирилиці
- **Supabase** (PostgreSQL + Auth) — база даних і вхід через
  Google; єдина зовнішня залежність застосунку (детальніше нижче)

Без збірника (webpack/vite тощо), без пакетного менеджера.
Практично весь JS підключається нативними ES-модулями (`<script
type="module">`) — браузер розуміє `import`/`export` без
збірника. Єдиний виняток — сам клієнт Supabase: бібліотека
`@supabase/supabase-js` підключається напряму з ESM-CDN
([esm.sh](https://esm.sh)) в [js/lib/supabaseClient.js](../js/lib/supabaseClient.js)
(`import ... from "https://esm.sh/@supabase/supabase-js@2"`) — без
`npm install`, без `node_modules`, без збірника. Свого бекенду
(сервера застосунку) у проєкту як і раніше немає — Supabase
виконує цю роль (база даних + автентифікація за REST/JS SDK,
захищена правилами RLS, без окремого сервера, який довелось би
писати й хостити самим).

Маршрутизація — клієнтська, на History API (без бібліотек-
роутерів), реалізована в [js/router.js](../js/router.js). Це
свідомий вибір: без бекенду єдиний спосіб мати адреси на кшталт
`/list/next` без дублювання розмітки навігації в кількох
`.html`-файлах — обробити переходи на клієнті.

Наслідок цього вибору: на статичному хостингу (і для локального
прев'ю) сервер має віддавати `index.html` для будь-якого шляху,
якого немає як файлу на диску (SPA-fallback) — інакше пряме
відкриття чи оновлення сторінки на `/list/next` поверне 404.
Для локальної розробки це робить [scripts/serve.py](../scripts/serve.py) —
маленький скрипт на stdlib Python (без нових залежностей),
який поводиться як звичайний статичний сервер, але для шляхів
без файлу й без розширення віддає `index.html`:

```bash
python3 scripts/serve.py
```

Конфіг для запуску прев'ю (`.claude/launch.json`) уже
використовує цей скрипт.

> Стек — мінімальний навмисно (правило №2 з PROJECT_RULES).
> Фреймворк чи збірник додаються лише тоді, коли складність
> проєкту дійсно цього вимагатиме.

### База даних і вхід через Google — підключено

[supabase/migrations/20260824000000_create_tasks_table.sql](../supabase/migrations/20260824000000_create_tasks_table.sql)
визначає таблицю `tasks` (поля — як у типі `Task`, задокументованому
JSDoc-коментарем на початку
[js/store/taskStore.js](../js/store/taskStore.js): `id`, `user_id`,
`title`, `note`, `list`, `tags`, `completed`, `deleted_at`,
`created_at`, `updated_at`) з увімкненою Row Level Security: чотири
політики
(select/insert/update/delete), кожна обмежує дію рядками, де
`user_id = auth.uid()` — без цього будь-хто з доступом до таблиці
бачив би чужі задачі. Міграцію виконано на реальному проєкті
Supabase.

Застосунок під'єднаний до нього:

- [js/config.js](../js/config.js) — Project URL і publishable key.
  Обидва значення публічні (не секрет — Supabase сам це підтверджує:
  реальний захист даних дають правила RLS, а не секретність цих
  значень), тому лежать прямо в коді. **Secret key (раніше
  «service_role») сюди ніколи не додається** — він дає повний доступ
  в обхід RLS і має жити лише на довіреному сервері, якого в проєкті
  немає.
- [js/lib/supabaseClient.js](../js/lib/supabaseClient.js) — створює
  єдиний спільний клієнт Supabase (`createClient(...)`), яким
  користуються store-файли.
- [js/store/authStore.js](../js/store/authStore.js) — `signInWithGoogle()`
  тепер запускає справжній OAuth-редірект через Supabase Auth
  (`supabase.auth.signInWithOAuth({ provider: "google" })`); Google
  Client ID/Secret налаштовані в Supabase (Authentication → Providers
  → Google), сам Client ID — у Google Cloud Console. `getSession()`
  лишився синхронним — читає закешоване значення, яке оновлюється
  через `supabase.auth.onAuthStateChange`; `initAuth()` (викликається
  раз, у [js/app.js](../js/app.js)) чекає, поки Supabase перевірить
  наявну сесію, перш ніж router.js зробить перший рендер — без цього
  на мить міг би майнути `/auth` навіть залогіненому користувачу.
- [js/store/taskStore.js](../js/store/taskStore.js) — `getTasks()`,
  `addTask()`, `setTaskCompleted()`, `moveTaskToTrash()` — реальні
  запити до таблиці `tasks` через Supabase JS SDK
  (`.select()/.insert()/.update()`). RLS сама фільтрує вибірку за
  `user_id` — фронтенду не потрібно (і не можна) імітувати цю
  фільтрацію самостійно; `getTasks("inbox")` сортує за `created_at`
  спаданням (найновіші зверху).

### Підзадачі й матеріали — підключено

[supabase/migrations/20260824010000_create_subtasks_and_materials_tables.sql](../supabase/migrations/20260824010000_create_subtasks_and_materials_tables.sql)
додає таблиці `subtasks` і `materials`, обидві з `task_id →
tasks(id) on delete cascade` (видалення задачі видаляє й усі її
підзадачі/матеріали):

- **`subtasks`** — підзадачі (Next Actions): `id`, `task_id`,
  `user_id`, `title`, `completed`, `created_at`, плюс `due_date` і
  `tags` із третьої міграції нижче. Підключено —
  [js/store/subtaskStore.js](../js/store/subtaskStore.js)
  (`getSubtasks`, `addSubtask`, `setSubtaskCompleted`,
  `setSubtaskDueDate`, `setSubtaskTags`, `deleteSubtask`) і UI в
  картці задачі та на сторінці `/task/:id` (розділ 3).
- **`materials`** — прикріплені посилання/файли: `id`, `task_id`,
  `user_id`, `type` (`link`/`file`/`notion`/`gdrive`, з `check`),
  `url`, `title`, `created_at`. Підключено —
  [js/store/materialStore.js](../js/store/materialStore.js)
  (`getMaterials`, `addMaterial`, `deleteMaterial`) і блок
  «Матеріали» на сторінці `/task/:id`. Реально працюють лише
  URL-типи (`link`/`notion`/`gdrive`) — `file` у схемі є, але UI
  його не створює: реальне завантаження файлів вимагає окремого
  сховища (Supabase Storage), якого в проєкті ще немає (розділ 5).

[supabase/migrations/20260824040000_add_due_date_and_tags_to_subtasks.sql](../supabase/migrations/20260824040000_add_due_date_and_tags_to_subtasks.sql)
додає до `subtasks` `due_date` і `tags` — власний міні-дедлайн і
міні-теги підзадачі, видно лише на сторінці `/task/:id`
(`detailedSubtasks: true`); у компактних картках («Вхідні»,
«Задачі», дошка) підзадача лишається простим чекліст-пунктом.

RLS для обох — той самий принцип, що й у `tasks` (`auth.uid() =
user_id`), але для INSERT/UPDATE є ще одна умова: `task_id` має
вказувати на задачу, яка теж належить цьому користувачу
(перевіряється підзапитом до `tasks`). Без цього можна було б
технічно прив'язати свою підзадачу чи матеріал до чужого `task_id`
— сам чужий рядок так і лишився б невидимим (RLS `tasks` це не
пропустить), але дозволяти таке «підвішування в порожнечу» немає
сенсу.

[supabase/migrations/20260824020000_add_priority_and_due_date_to_tasks.sql](../supabase/migrations/20260824020000_add_priority_and_due_date_to_tasks.sql)
додає до `tasks` дві колонки: `priority` і `due_date` (дедлайн,
`date`, nullable). **`due_date` — активно використовується** (поле
дедлайну в картці задачі); **`priority` — більше не
використовується** застосунком (див. нижче) і лишається в базі
незадіяним залишком; спеціально дропати колонку не буду без
окремого прохання (це вже видалення даних, а не додавання).

[supabase/migrations/20260824030000_add_status_to_tasks.sql](../supabase/migrations/20260824030000_add_status_to_tasks.sql)
додає колонку `status` (`urgent`/`not_urgent`/`daily`/`cancelled`/
`waiting`, дефолт `not_urgent`). **Це єдине поле і для колонок
дошки `/board`, і для dropdown «Статус» у картці задачі** —
свідомо синхронізовано через одне джерело правди: `TaskCard.js` і
`board.js` викликають той самий `setTaskStatus()`. Спершу тут було
два окремі поля (`priority` для картки, `status` для дошки) —
переглянуто на прохання користувача об'єднати їх в одне; звідси й
незадіяний `priority` вище. «Виконані» на дошці — це
`completed = true`, не значення `status`.

Вхід через Google — редірект-флоу: клік по кнопці переносить
браузер на `accounts.google.com`, а сесія з'являється вже після
повернення на `/auth` (роутер сам побачить сесію й перенаправить
у застосунок). Якщо вхід скасовано чи стався збій, Google/Supabase
повертають на `/auth?error=...` — `consumeAuthError()` показує цей
текст під кнопкою й одразу прибирає параметри з адресного рядка.

**Меню акаунта** ([AccountMenu.js](../js/components/AccountMenu.js)) —
аватар-кнопка в навігації замість того, що раніше висіло прямо в
барі (пошта + «Вийти»): ім'я — з Google-профілю
(`user_metadata.full_name`, Supabase кладе його туди сама після
OAuth-логіну) або власне, задане через `authStore
.updateDisplayName()`. Фото — **лише власне**, завантажене через
`authStore.uploadAvatar()` (Supabase Storage — розділ нижче); нема
фото — кружечок з першою літерою імені/пошти. Google-фото свідомо
не підтягуємо автоматично: перша версія так і робила через
`provider_token`, обходячи баг Supabase (GoTrue не завжди переносить
`picture` в `user_metadata` — discussions supabase/supabase #2167,
#4047), але після живого тестування виявилось простіше й надійніше
дати користувачу самому завантажити своє фото, ніж далі гнатись за
цим обхідним шляхом. Посилання на «Інтеграції» перенесено сюди з
головного меню — зайва вкладка там, якщо нею користуються рідко.

### Supabase Storage — фото акаунта й файли в «Матеріалах»

Один спільний бакет `user-uploads` (публічний на читання — інакше
фото профілю чи матеріал не відкрились би прямим посиланням
(`<img src>`) без Supabase-сесії в кожному запиті), обслуговує два
місця: [AccountMenu.js](../js/components/AccountMenu.js) (фото
акаунта, шлях `{user_id}/avatar.<розширення>` — той самий файл
перезаписується щоразу, `upsert`) і
[MaterialsBlock.js](../js/components/MaterialsBlock.js) («Зображення»/
«Файл», шлях `{user_id}/materials/{task_id}/{файл}`). Сам виклик
завантаження — спільний [storageStore.js](../js/store/storageStore.js)
(`uploadFile(path, file)`, повертає публічне посилання).

Запис обмежує RLS `storage.objects` — перша частина шляху (`(storage
.foldername(name))[1]`) має дорівнювати `auth.uid()`, той самий
принцип «лише своє», що й у решті таблиць проєкту, лише застосований
до файлової системи бакета, а не до звичайної таблиці. Виконати
[20260825030000_setup_storage_bucket.sql](../supabase/migrations/20260825030000_setup_storage_bucket.sql)
у Supabase SQL Editor — і фото/файли одразу запрацюють, окремих
секретів чи деплою функцій не треба (це не Edge Function, працює
напряму через `supabase-js`, як і решта клієнтських store).

### Telegram-бот — підключено

Задачу можна додати в «Вхідні» повідомленням Telegram-боту (текст —
напряму, голосове — через розпізнавання мовлення). До цього моменту
весь застосунок обходився без жодного власного сервера: браузер сам
звертався до Supabase, підпираючись лише RLS. Боту потрібен
довірений сервер — щось повинно приймати вебхук від Telegram,
качати голосові файли, звертатись до Whisper-сумісного API й писати
задачу в базу вже **в обхід RLS** (у момент повідомлення відомий
лише `telegram_chat_id`, жодної Supabase-сесії немає). Для цього —
[supabase/functions/telegram-webhook/index.ts](../supabase/functions/telegram-webhook/index.ts),
**Supabase Edge Function** (Deno), обрана свідомо замість Netlify
Functions: не займає деплой-квоту Netlify (обмежену на безкоштовному
тарифі), секрети (bot token, service_role key, Whisper API key)
живуть окремо від сайту, в секретах самої функції.

**Прив'язка акаунта** — таблиця
[telegram_links](../supabase/migrations/20260825000000_create_telegram_links_table.sql)
(`user_id` ↔ `telegram_chat_id`), через одноразовий код:

1. Сторінка «Інтеграції» (`/integrations`,
   [IntegrationsCard.js](../js/components/IntegrationsCard.js) +
   [telegramStore.js](../js/store/telegramStore.js)) — кнопка
   «Згенерувати код прив'язки» пише `link_code` (6 символів, дійсний
   15 хв) у власний рядок користувача. Це звичайний клієнтський
   запит через RLS (`auth.uid() = user_id`), як і все інше в
   проєкті — секретів тут немає.
2. Користувач переходить за посиланням `https://t.me/<бот>?start=<код>`
   (або вручну пише `/start <код>` боту).
3. Edge Function отримує Update, знаходить рядок за `link_code` (не
   за `user_id` — на цей момент вона ще не знає, хто пише),
   заповнює `telegram_chat_id`/`telegram_username`/`telegram_first_name`,
   чистить код. Тут потрібен `service_role key` — RLS дозволив би
   лише власнику рядка, а на момент запиту авторизованого
   користувача просто немає.

**Кожне наступне повідомлення** (не `/start`) — функція шукає
`user_id` за `telegram_chat_id`; якщо не знайдено, просить спершу
прив'язатись. Текст іде в задачу напряму; голосове (`message.voice`)
— спершу `getFile`/завантаження від Telegram, тоді POST на
`WHISPER_API_BASE_URL` (дефолт — Groq, `whisper-large-v3`, безкоштовний
ліміт; можна переключити на OpenAI лише зміною секретів, без
редагування коду). Розпізнаний/уведений текст → `title`, `list =
"inbox"`, `insert` у `tasks` тим самим `service_role`-клієнтом. У
відповідь — `sendMessage` з підтвердженням.

**Захист вебхука** — `TELEGRAM_WEBHOOK_SECRET`: Telegram підставляє
цей самий секрет у заголовок `X-Telegram-Bot-Api-Secret-Token`
кожного запиту (вказується один раз при реєстрації вебхука); функція
звіряє його першим ділом і відкидає все, де він не збігається, —
без цього хтось, хто просто дізнався URL функції, міг би створювати
задачі від чужого імені.

**Розгортання й підключення (уже виконано для цього проєкту 25.08.2026)** —
лишається як інструкція на майбутнє: якщо колись знадобиться
задеплоїти функцію заново, ротувати секрет чи підключити ще одного
Telegram-бота. Кроки, де фігурують секрети чи Telegram-акаунт,
виконує сам користувач — Claude не має до них доступу:

1. **Створити бота** — Telegram → [@BotFather](https://t.me/BotFather) →
   `/newbot`, отримати токен (`123456:ABC-...`). Вписати ім'я бота
   (без `@`) в [js/config.js](../js/config.js) →
   `TELEGRAM_BOT_USERNAME` (не секрет, публічне ім'я).
2. **Отримати ключ Whisper** — [console.groq.com](https://console.groq.com)
   (безкоштовно) → API Keys → створити ключ.
3. **Виконати міграцію** `20260825000000_create_telegram_links_table.sql`
   у Supabase SQL Editor (як і решта міграцій — розділ 1 вище).
4. **Прив'язати Supabase CLI до проєкту** (якщо ще не робили):
   ```bash
   supabase login
   supabase link --project-ref ufjkundsaelfstfxslck
   ```
5. **Задати секрети функції** (`TELEGRAM_WEBHOOK_SECRET` — вигадати
   самому, будь-який довгий випадковий рядок, наприклад
   `openssl rand -hex 24`; `SUPABASE_URL` і
   `SUPABASE_SERVICE_ROLE_KEY` **задавати не треба** — Supabase сам
   підставляє їх у кожну Edge Function автоматично, без
   `secrets set`; сторінка «Legacy anon, service_role API keys» в
   Dashboard тут узагалі не потрібна):
   ```bash
   supabase secrets set \
     TELEGRAM_BOT_TOKEN=<токен_від_BotFather> \
     TELEGRAM_WEBHOOK_SECRET=<свій_випадковий_рядок> \
     WHISPER_API_KEY=<ключ_Groq>
   ```
6. **Задеплоїти функцію**:
   ```bash
   supabase functions deploy telegram-webhook
   ```
   (URL після деплою: `https://ufjkundsaelfstfxslck.supabase.co/functions/v1/telegram-webhook`)
7. **Зареєструвати вебхук у Telegram** (той самий секрет, що й у
   кроці 5):
   ```bash
   curl -X POST "https://api.telegram.org/bot<токен_від_BotFather>/setWebhook" \
     -d "url=https://ufjkundsaelfstfxslck.supabase.co/functions/v1/telegram-webhook" \
     -d "secret_token=<свій_випадковий_рядок>"
   ```
8. Відкрити `/integrations` у застосунку → «Згенерувати код
   прив'язки» → перейти за посиланням у Telegram → готово.

### Щоденне нагадування — потребує ручного налаштування

[supabase/functions/daily-reminder/index.ts](../supabase/functions/daily-reminder/index.ts)
— окрема Edge Function, яка не приймає нічого від Telegram (на
відміну від `telegram-webhook/`), а сама щодня о 09:00 за київським
часом перевіряє `tasks` (активні, не виконані, є `due_date`),
рахує окремо прострочені (`due_date < сьогодні`) і задачі на
сьогодні (`due_date = сьогодні`) для кожного `user_id`, і якщо є
хоч одна — надсилає повідомлення в прив'язаний Telegram-чат
(`telegram_links`, той самий принцип, що й у боті): «🔔 Доброго
ранку! У вас N задач на сьогодні і M прострочених…» із посиланням
на сайт. Немає задач із дедлайном чи нема прив'язки Telegram —
мовчки нічого не надсилає.

Розклад — [pg_cron](https://github.com/citusdata/pg_cron) +
[pg_net](https://github.com/supabase/pg_net) (обидва — стандартні
розширення Postgres у Supabase, увімкнені прямо в SQL-міграції
нижче): щодня о 06:00 UTC (= 09:00 в Україні влітку, 08:00 взимку —
pg_cron не знає про літній/зимовий час, різниця в годину визнана
прийнятною для нагадування) `pg_cron` виконує `net.http_post()` на
адресу функції. Захист від чужих запитів — `CRON_SECRET` у
заголовку `x-cron-secret`, той самий принцип, що й
`TELEGRAM_WEBHOOK_SECRET` у боті.

**Розгортання (ручні кроки — секрети й SQL я не бачу й не
виконую):**

1. Придумати `CRON_SECRET` (`openssl rand -hex 24`).
2. Задати секрет функції:
   ```bash
   supabase secrets set CRON_SECRET=<той_самий_рядок>
   ```
3. Задеплоїти функцію:
   ```bash
   supabase functions deploy daily-reminder
   ```
4. Виконати міграцію
   [20260825010000_setup_daily_reminder_cron.sql](../supabase/migrations/20260825010000_setup_daily_reminder_cron.sql)
   у Supabase SQL Editor — **перед запуском** замінити
   `REPLACE_WITH_YOUR_CRON_SECRET` у самому SQL-файлі (в редакторі,
   не в git) на той самий рядок, що й у кроці 1–2.
5. Перевірити, що завдання справді заплановане:
   ```sql
   select * from cron.job where jobname = 'daily-reminder-9am-kyiv';
   ```
6. За бажанням — перевірити функцію одразу, не чекаючи 9 ранку
   (підставивши свій `CRON_SECRET`):
   ```bash
   curl -X POST "https://ufjkundsaelfstfxslck.supabase.co/functions/v1/daily-reminder" \
     -H "x-cron-secret: <той_самий_рядок>"
   ```

### AI-фічі — «Розбити на кроки» і «Що зробити зараз?»

Дві фічі, обидві через один проксі —
[supabase/functions/ai-assist/index.ts](../supabase/functions/ai-assist/index.ts).
На відміну від `telegram-webhook`/`daily-reminder`, цю функцію
викликає сам застосунок від імені залогіненого користувача
(`supabase.functions.invoke()` у
[js/store/aiStore.js](../js/store/aiStore.js) сам додає Bearer-
токен поточної сесії) — `verify_jwt` лишається дефолтним (`true`,
без запису в `config.toml`): Supabase перевіряє сесію ще до нашого
коду, окремого секрету захисту не треба. Функція не чіпає базу
взагалі — лише звертається до Groq і повертає відповідь; сам запис
підзадач/читання задач лишається на клієнті через звичайні RLS-
захищені `subtaskStore.js`/`taskStore.js`.

Ключ Groq — **той самий `WHISPER_API_KEY`**, що вже налаштований
для розпізнавання голосу в `telegram-webhook` (один Groq-акаунт,
один ключ працює на будь-який їхній ендпоінт, не лише Whisper) —
нового секрету заводити не треба, лише задеплоїти функцію:
```bash
supabase functions deploy ai-assist
```

**«✨ Розбити на кроки»** ([TaskCard.js](../js/components/TaskCard.js))
— кнопка в блоці «Підзадачі» будь-якої картки задачі. Надсилає
`{ type: "breakdown", title }`, Groq повертає 3-5 кроків
(`{"steps": [...]}`), кожен зберігається окремим викликом
`addSubtask()` — тим самим шляхом, що й ручне додавання підзадачі,
жодного нового способу запису в базу.

**«✨ Що зробити зараз?»** ([inbox.js](../js/pages/inbox.js) +
[NextTaskSuggestion.js](../js/components/NextTaskSuggestion.js)) —
кнопка на «Вхідних» (не самі «Вхідні» перевіряє, а список
«Задачі» — `list = "next"`, бо там уже розібрані, готові до
виконання пункти, а не сирі нотатки). Бере до 10 задач, надсилає
`{ type: "next-task", tasks: [{id, title}] }`, Groq обирає одну й
пояснює чому (`{"task_id": "...", "reason": "..."}`) — картка-
підказка показує назву (посилання на `/task/:id`) і пояснення.
Немає задач у списку «Задачі» — картка чесно каже про це, а не
вдає порожню відповідь ШІ.

Обидві фічі — той самий принцип обробки помилок, що й скрізь у
проєкті: `console.error()` для діагностики, фіксований український
текст (`window.alert(...)`) користувачу, ніякого сирого тексту від
Groq на екрані.

### «Джерела» і «Стрічка» — потребує ручного налаштування

Дві нові сторінки під один сценарій: «Джерела» (`/sources`) —
керуєш підписками (YouTube/Telegram/Instagram/Threads/Reddit/
Twitter/RSS); «Стрічка» (`/feed`) — сюди стікаються пости з цих
джерел, зібрані зовнішнім парсером (Apify, Firecrawl тощо, сам
парсинг — поза застосунком, ми лише приймаємо результат).

**«Джерела»** — звичайний RLS-захищений CRUD
([sourceStore.js](../js/store/sourceStore.js),
[SourceForm.js](../js/components/SourceForm.js),
[SourceList.js](../js/components/SourceList.js)/[SourceItem.js](../js/components/SourceItem.js)),
той самий підхід, що й «Вхідні»/«Кошик». Кожен рядок показує свій
`id` (`ID для вебхука`) — саме його потрібно підставити в
налаштування зовнішнього парсера, щоб приймальний вебхук знав, до
якого джерела належить пост.

**«Стрічка»** — записи в `feed_items` вставляє лише
[supabase/functions/feed-webhook/index.ts](../supabase/functions/feed-webhook/index.ts)
(service_role, в обхід RLS — на момент запиту немає Supabase-сесії,
лише `source_id`); клієнт (`feedStore.js`) лише читає (`status =
"new"`) і міняє статус. Очікуваний JSON — один об'єкт, масив або
`{ "items": [...] }`:
```json
{
  "source_id": "<ID із «Джерела»>",
  "external_id": "опційно — id відео/твіту/посту, для дедупу",
  "author": "опційно",
  "title": "обов'язково",
  "text": "опційно",
  "url": "обов'язково",
  "published_at": "опційно, ISO-дата"
}
```
`user_id` функція сама бере з `sources` за `source_id` — зовнішній
парсер його не знає й не повинен. Дедуп — унікальний індекс
`(source_id, external_id)`: той самий пост, надісланий вдруге,
тихо ігнорується (не помилка). Захист — `FEED_WEBHOOK_SECRET`
(заголовок `x-feed-webhook-secret` **або** `?secret=...` у URL —
деяким no-code інструментам зручніше з query, ніж з кастомними
заголовками).

**Переклад** — при кожному вхідному пості функція одразу питає Groq
(`_shared/groqChat.ts`, той самий ключ і модель, що й в
`ai-assist`) перекласти заголовок і текст на українську (якщо вони
вже українською — Groq повертає без змін); результат — `title_uk`/
`text_uk`, саме їх показує картка стрічки (`title`/`text` —
оригінал, лишається в базі про запас, в UI не використовується).
Переклад не критичний для збереження поста: якщо Groq недоступний,
пост однаково зберігається — з оригінальним текстом замість
перекладеного (`console.error`, без відмови всього запиту).

**Дії над постом** (`FeedCard.js`): «✅ В Inbox» створює задачу
(`title` = `title_uk`, `note` = посилання на оригінал — щоб не
загубити джерело) і ставить `feed_items.status = "added"`; «✖
Пропустити» — просто `status = "skipped"`; обидва прибирають пост
зі стрічки (там показуються лише `status = "new"`). «🔗 Відкрити» —
звичайне посилання на `url`, нічого не змінює.

**Розгортання (ручні кроки):**

1. Виконати міграцію
   [20260825020000_create_sources_and_feed_items_tables.sql](../supabase/migrations/20260825020000_create_sources_and_feed_items_tables.sql)
   у Supabase SQL Editor.
2. Придумати `FEED_WEBHOOK_SECRET` (`openssl rand -hex 24`) і
   задати секрет:
   ```bash
   supabase secrets set FEED_WEBHOOK_SECRET=<той_самий_рядок>
   ```
3. Задеплоїти функцію:
   ```bash
   supabase functions deploy feed-webhook
   ```
4. Додати хоч одне джерело на `/sources`, скопіювати його `id`.
5. Налаштувати зовнішній парсер (Apify/Firecrawl/будь-що інше, що
   вміє надіслати POST) слати результат на
   `https://ufjkundsaelfstfxslck.supabase.co/functions/v1/feed-webhook`
   з `source_id` = скопійований `id` і заголовком
   `x-feed-webhook-secret: <той_самий_рядок>` (чи `?secret=...`).
6. Перевірити вручну (заміни `<...>` на свої значення):
   ```bash
   curl -X POST "https://ufjkundsaelfstfxslck.supabase.co/functions/v1/feed-webhook" \
     -H "Content-Type: application/json" \
     -H "x-feed-webhook-secret: <той_самий_рядок>" \
     -d '{"source_id":"<id_джерела>","title":"Тестовий пост","text":"Hello from a test post","url":"https://example.com"}'
   ```
   Пост має з'явитись на `/feed` — і, якщо `WHISPER_API_KEY`
   (Groq) уже налаштований, з перекладеним текстом.

## 2. Структура папок

```
GTD додаток/
├── index.html               — єдина точка входу (shell застосунку)
├── css/
│   ├── style.css             — дизайн-токени (:root) + глобальні стилі
│   ├── nav.css                — стилі компонента навігації
│   ├── page.css                 — спільні стилі контенту сторінок
│   ├── auth.css                  — стилі сторінки логіну (картка, кнопка Google)
│   ├── task-form.css              — стилі картки форми додавання задачі
│   ├── task-list.css               — колонка карток задач / порожній стан
│   ├── task-card.css                — сама картка задачі + вкладені підзадачі
│   ├── trash.css                    — стилі рядків кошика (кнопки дій)
│   ├── board.css                     — дошка Kanban (.page--wide, колонки, drag-over)
│   ├── task-detail.css                — /task/:id: «Назад», блок «Матеріали»
│   ├── integrations.css                — картка Telegram-інтеграції (/integrations)
│   ├── ai-suggestion.css               — кнопка + картка «Що зробити зараз?»
│   ├── sources.css                     — форма + список джерел (/sources)
│   └── feed.css                        — картки постів стрічки (/feed)
├── js/
│   ├── app.js                 — точка входу: чекає initAuth(), монтує навігацію й роутер
│   ├── router.js               — маршрути, доступ, History API, рендер сторінок
│   ├── config.js                — Project URL + publishable key Supabase (не секрет)
│   │                             + TELEGRAM_BOT_USERNAME (теж не секрет)
│   ├── lib/
│   │   └── supabaseClient.js      — єдиний клієнт Supabase (createClient)
│   ├── store/
│   │   ├── taskStore.js           — задачі через Supabase (getTaskById, getTasks,
│   │   │                             getAllTasks, addTask, setTaskCompleted,
│   │   │                             setTaskStatus, setTaskList, setTaskDueDate,
│   │   │                             setTaskTags, moveTaskToTrash, getTrashedTasks,
│   │   │                             restoreTask, deleteTaskPermanently)
│   │   │                             + JSDoc-тип Task
│   │   ├── subtaskStore.js         — підзадачі (getSubtasks, addSubtask,
│   │   │                             setSubtaskCompleted, setSubtaskDueDate,
│   │   │                             setSubtaskTags, deleteSubtask)
│   │   ├── materialStore.js         — матеріали (getMaterials, addMaterial,
│   │   │                             deleteMaterial)
│   │   ├── authStore.js            — сесія через Supabase Auth (getSession, signInWithGoogle, signOut)
│   │   ├── telegramStore.js        — прив'язка Telegram (getTelegramLink,
│   │   │                             generateLinkCode, unlinkTelegram)
│   │   ├── aiStore.js               — проксі до ai-assist/ (breakdownTaskWithAI,
│   │   │                             suggestNextTaskWithAI)
│   │   ├── sourceStore.js           — джерела (getSources, addSource, deleteSource)
│   │   ├── feedStore.js             — стрічка (getFeedItems, skipFeedItem,
│   │   │                             markFeedItemAdded)
│   │   └── storageStore.js           — uploadFile(path, file) → публічне посилання
│   │                             (Supabase Storage, бакет user-uploads)
│   ├── components/
│   │   ├── Nav.js                — навігація (меню, бургер, монтує AccountMenu.js)
│   │   ├── AccountMenu.js          — меню акаунта: аватар/ім'я/пошта,
│   │   │                             «Інтеграції», «Вийти»
│   │   ├── AuthCard.js             — картка логіну (кнопка Google, помилка)
│   │   ├── TaskForm.js            — картка форми (стан збереження, помилка)
│   │   ├── TaskList.js             — колонка карток задач / порожній стан
│   │   ├── TaskCard.js              — картка задачі: назва-посилання, теги,
│   │   │                             статус/список, дедлайн, підзадачі
│   │   │                             («пульт керування»; detail/detailedSubtasks
│   │   │                             — більший масштаб для /task/:id)
│   │   ├── SubtaskList.js            — список підзадач + форма додавання
│   │   ├── SubtaskItem.js             — один рядок підзадачі (+ міні-теги/дедлайн
│   │   │                             у детальному режимі)
│   │   ├── MaterialsBlock.js           — блок «Матеріали»: кнопки додавання + сітка
│   │   ├── TrashList.js             — картка кошика / «Кошик порожній.»
│   │   ├── TrashItem.js              — рядок кошика («Відновити» / «Видалити назавжди»)
│   │   ├── IntegrationsCard.js         — картка Telegram: статус, код прив'язки, відв'язати
│   │   ├── NextTaskSuggestion.js        — кнопка + картка «Що зробити зараз?» (AI)
│   │   ├── SourceForm.js                — форма додавання джерела (платформа + handle)
│   │   ├── SourceList.js                 — список джерел / порожній стан
│   │   ├── SourceItem.js                  — рядок джерела (платформа, handle, id, видалити)
│   │   ├── FeedList.js                     — список постів стрічки / порожній стан
│   │   └── FeedCard.js                      — картка поста: мета, заголовок/текст, 3 дії
│   └── pages/
│       ├── auth.js              — сторінка логіну (/auth)
│       ├── inbox.js             — сторінка «Вхідні» (форма + список карток)
│       ├── listPage.js           — фабрика сторінки-списку без форми
│       │                             (createListPage — спільна логіка для 4 сторінок нижче)
│       ├── next.js              — сторінка «Задачі» (/list/next)
│       ├── readWatch.js          — сторінка «Читати / Дивитись» (/list/read_watch)
│       ├── someday.js            — сторінка «Колись» (/list/someday)
│       ├── archive.js            — сторінка «Архів» (/list/archive)
│       ├── board.js             — дошка Kanban (/board): колонки, drag-and-drop
│       ├── taskDetail.js         — детальний перегляд задачі (/task/:id)
│       ├── trash.js             — сторінка «Кошик» (/trash)
│       ├── integrations.js       — сторінка «Інтеграції» (/integrations)
│       ├── sources.js             — сторінка «Джерела» (/sources)
│       └── feed.js                 — сторінка «Стрічка» (/feed)
├── scripts/
│   └── serve.py                 — локальний сервер з SPA-fallback
├── supabase/
│   ├── config.toml               — потрібен лише для деплою Edge Functions нижче
│   ├── functions/
│   │   ├── _shared/
│   │   │   └── groqChat.ts        — спільний виклик Groq chat completions (JSON-
│   │   │                         режим), для ai-assist/ і feed-webhook/
│   │   ├── telegram-webhook/
│   │   │   └── index.ts          — приймає Update від Telegram, створює задачу
│   │   │                         (текст чи Whisper-транскрипція голосового),
│   │   │                         відповідає в чат (Deno, service_role key)
│   │   ├── daily-reminder/
│   │   │   └── index.ts          — щодня о 9:00 (pg_cron) перевіряє прострочені
│   │   │                         задачі й задачі на сьогодні, шле нагадування
│   │   ├── ai-assist/
│   │   │   └── index.ts          — проксі до Groq: розбити задачу на кроки /
│   │   │                         обрати задачу для швидкої перемоги
│   │   └── feed-webhook/
│   │       └── index.ts          — приймає пости від зовнішнього парсера
│   │                             (Apify/Firecrawl), перекладає, зберігає у feed_items
│   └── migrations/
│       ├── 20260824000000_create_tasks_table.sql
│       │                          — схема tasks + RLS (виконано на реальному проєкті)
│       ├── 20260824010000_create_subtasks_and_materials_tables.sql
│       │                          — схема subtasks + materials + RLS (виконано)
│       ├── 20260824020000_add_priority_and_due_date_to_tasks.sql
│       │                          — due_date (активний) + priority (незадіяний
│       │                          у коді — див. нижче) (виконано)
│       ├── 20260824030000_add_status_to_tasks.sql
│       │                          — status: картка + дошка Kanban, спільне поле (виконано)
│       ├── 20260824040000_add_due_date_and_tags_to_subtasks.sql
│       │                          — due_date + tags для subtasks, /task/:id (виконано)
│       ├── 20260825000000_create_telegram_links_table.sql
│       │                          — telegram_links: chat_id ↔ user_id (виконано)
│       ├── 20260825010000_setup_daily_reminder_cron.sql
│       │                          — pg_cron+pg_net: щоденний виклик daily-reminder
│       │                          (потребує виконання — заміни секрет перед запуском)
│       ├── 20260825020000_create_sources_and_feed_items_tables.sql
│       │                          — sources + feed_items + RLS (потребує виконання)
│       └── 20260825030000_setup_storage_bucket.sql
│                                  — бакет user-uploads + RLS (потребує виконання)
├── docs/
│   ├── PRD.md                    — опис продукту
│   └── ARCHITECTURE.md           — цей документ
├── PROJECT_RULES.md          — правила розробки
└── .claude/
    └── launch.json               — конфіг локального прев'ю-сервера
```

Кожен компонент і кожна сторінка — в окремому файлі (правило №3 з
PROJECT_RULES): `Nav.js` не знає, як рендерити сторінки, сторінки
не знають, як влаштована навігація, `router.js` лише зіставляє
шлях із функцією рендеру. Так само на «Вхідних»/«Задачах»/дошці/
`/task/:id`: `TaskForm.js` (форма додавання, лише на «Вхідних»),
`TaskList.js` (колонка карток/порожній стан) і `TaskCard.js` (сама
картка) — окремі, незалежні компоненти; сторінки лише компонують
їх і беруть дані з `store/taskStore.js`. Підзадачі всередині
картки — так само, окремо: `SubtaskList.js` (список + форма
додавання) і `SubtaskItem.js` (один рядок). Матеріали на
`/task/:id` — `MaterialsBlock.js`, сам вантажить свої дані з
`store/materialStore.js` (той самий принцип, що й підзадачі в
`TaskCard.js` — самодостатній блок, а не проштовхані згори дані).

`js/store/taskStore.js` — уся логіка роботи з задачами: `getTaskById`
(одна задача за id, для `/task/:id`), `getTasks`, `getAllTasks`
(для дошки), `addTask`, `setTaskCompleted`, `setTaskStatus`,
`setTaskList` (переміщення між списками), `setTaskDueDate`,
`setTaskTags`, `moveTaskToTrash` (м'яке видалення — ставить
`deleted_at`), `getTrashedTasks`, `restoreTask` (очищає
`deleted_at`), `deleteTaskPermanently` (реальний SQL `DELETE`) —
усі `async`, бо це мережеві запити. `js/store/subtaskStore.js` —
так само, але для `subtasks` (`getSubtasks`, `addSubtask`,
`setSubtaskCompleted`, `setSubtaskDueDate`, `setSubtaskTags`,
`deleteSubtask`); `js/store/materialStore.js` — для `materials`
(`getMaterials`, `addMaterial`, `deleteMaterial`). Це шар, окремий
від UI-компонентів (правило №6): компоненти лише повідомляють про
дію користувача через колбек (`onSubmit`, `onToggleCompleted`,
`onDelete`, `onStatusChange`, `onListChange`, `onDueDateChange`,
`onAddTag`, `onToggle`, `onRestore`, `onDeleteForever` — залежно
від компонента), сторінки/картка викликають відповідну функцію
стору — самі компоненти нічого не знають про те, як і де щось
зберігається.

**Три різні моделі оновлення UI**, свідомо:
- **Мутації самої задачі** (тег, статус, список, дедлайн, виконано,
  кошик) — сторінка (`inbox.js`/`next.js`/`board.js`/`taskDetail.js`)
  перечитує задачу(і) й перемальовує відповідний блок після кожної.
  Просто й надійно; ціна — зайві мережеві запити (картки
  перезавантажують і свої підзадачі), прийнятно для особистого
  застосунку з невеликою кількістю задач.
- **Підзадачі** — `TaskCard.js` сам вантажить і оновлює лише свій
  розділ підзадач, без перемальовування картки чи сторінки:
  додавання нової підзадачі — **Optimistic UI** (`SubtaskList.js`):
  рядок з'являється в списку одразу, ще до відповіді бази; якщо
  збереження вдалось — тимчасовий id рядка тихо підмінюється на
  справжній; якщо ні — рядок прибирається і показується помилка.
  Зміна міні-тега/міні-дедлайна підзадачі (лише `/task/:id`) —
  локальний DOM-патч усередині самого рядка (`SubtaskItem.js`), теж
  без перемальовування картки.
- **Матеріали** — так само самодостатній блок: `MaterialsBlock.js`
  сам вантажить і перемальовує лише свою сітку після додавання чи
  видалення.

`pages/inbox.js`, `pages/next.js`, `pages/board.js`,
`pages/taskDetail.js` і `pages/trash.js` монтують незмінну частину
(форму/заголовок/кнопку «Назад») один раз; після кожної дії
перемальовують лише сам список чи картку — решта сторінки не
зникає й не втрачає стан. Поки дані вантажаться — показують
«Завантаження…»; якщо запит не вдався — фіксований текст помилки
українською замість вмісту (наприклад, «Не вдалося завантажити
задачі. Спробуйте оновити сторінку.»), а справжній об'єкт помилки
йде лише в `console.error()` — для діагностики розробником, не на
екран користувачу. Так у всіх `catch`-блоках проєкту: `err`
логується в консоль, користувач завжди бачить лише свій, наперед
написаний українською варіант. (Раніше, коли шукали причину, чому
`err instanceof Error ? err.message : "…"` завжди мовчки показував
загальний напис — з'ясувалось, що об'єкти помилок Supabase не є
справжніми `Error`, — тимчасово перейшли на показ `err?.message`
безпосередньо користувачу; це давало точний текст для налагодження,
але ламало вимогу «весь текст українською», бо Supabase повертає
свої повідомлення англійською. Тому зафіксували підхід вище:
`console.error(err)` + завжди фіксований український напис.) Помилки при
діях над одним рядком (відмітити / перемістити в кошик / відновити
/ видалити назавжди / змінити статус чи список / дедлайн / тег)
показуються через `window.alert()` (мінімальний варіант, без
окремого UI під кожен рядок); чекбокс «виконано» при невдачі
додатково повертається в попередній стан. «Видалити назавжди» в
кошику (`TrashItem.js`) — незворотна дія, тому перед самим запитом
до бази ще й підтверджується через `window.confirm()`.

### Автентифікація — Supabase Auth (Google OAuth)

`js/store/authStore.js` — `getSession()`, `signInWithGoogle()`,
`signOut()`, `initAuth()`, `consumeAuthError()`. Детально, як це
працює — розділ 1, «База даних і вхід через Google». Сесія — за
Supabase Auth: переживає перезавантаження сторінки (на відміну від
задач, вона не в JS-пам'яті, а в сховищі браузера, яким керує сам
Supabase SDK).

## 3. Маршрути додатку

Маршрутизація — клієнтська (History API), таблиця маршрутів
визначена в [js/router.js](../js/router.js):

| Адреса               | Сторінка             | Доступ | Стан |
|-----------------------|------------------------|--------|------|
| `/`                    | — | — | редірект на `/inbox` (якщо є сесія) або `/auth` |
| `/auth`                | Вхід                   | лише неавторизованим | картка логіну через Google (Supabase Auth) |
| `/inbox`               | Вхідні                 | лише авторизованим | форма + список із реальної бази |
| `/list/next`           | Задачі                 | лише авторизованим | список із реальної бази (без форми додавання) |
| `/board`                | Дошка                  | лише авторизованим | Kanban: усі активні задачі колонками, drag-and-drop |
| `/task/:id`             | Задача                 | лише авторизованим | детальний перегляд: велика картка + матеріали |
| `/list/read_watch`     | Читати / Дивитись      | лише авторизованим | список із реальної бази (без форми додавання) |
| `/list/someday`        | Колись                 | лише авторизованим | список із реальної бази (без форми додавання) |
| `/list/archive`        | Архів                  | лише авторизованим | список із реальної бази (без форми додавання) |
| `/sources`             | Джерела                | лише авторизованим | форма додавання + список підписок, id для вебхука |
| `/feed`                | Стрічка                | лише авторизованим | картки постів: В Inbox / Пропустити / Відкрити |
| `/trash`               | Кошик                  | лише авторизованим | список видалених + відновлення / остаточне видалення |
| `/integrations`        | Інтеграції             | лише авторизованим | картка Telegram: статус прив'язки, код, відв'язати |

Будь-який невідомий шлях так само веде на `/inbox` або `/auth`,
залежно від сесії. Пункти головного меню генеруються з цієї ж
таблиці маршрутів (`getRoutes()` у `router.js`, лише захищені,
лише статичні — динамічні шляхи типу `/task/:id` у меню не
потрапляють, на них переходять кліком по назві задачі) — щоб не
тримати список посилань окремо у навігації й окремо в роутері.
`/integrations` — виняток: `hideFromNav: true` прибирає його з
головного меню (сам маршрут лишається робочим, посилання на нього —
в меню акаунта, `AccountMenu.js`) — щоб не захаращувати головне
меню сторінкою, якою користуються рідко.

`/task/:id` — перший (і поки єдиний) маршрут із параметром.
`router.js` розпізнає сегмент `:id` найпростішим матчингом
(`matchRoute()`, без бібліотеки-роутера) і передає розібраний
параметр другим аргументом у `route.render(pageRoot, params)` —
решта сторінок цей аргумент просто ігнорують, зворотної
несумісності немає. Заголовок задачі скрізь, де показується картка
(`TaskCard.js`), — посилання `<a href="/task/{id}" data-link>` на
цю сторінку; той самий глобальний обробник кліків у `router.js`
(що вже перехоплює пункти меню) підхоплює й цей лінк без додаткової
розводки.

`/board` — єдиний маршрут із `wide: true`: сторінка отримує клас
`.page--wide` (ширший контент, `--board-width: 1150px`, замість
звичайних 768px). Усі 6 колонок статусів показані одразу, без
спойлера, сіткою 3×2 (`.board { display: grid; grid-template-
columns: repeat(3, ...); }`) — перші три статуси в порядку масиву
`COLUMNS` зверху, решта три рядком під ними; коли й трьом колонкам
поруч тісно (вузькі екрани) — кожен ряд сам прокручується
(`overflow-x: auto`). [js/pages/board.js](../js/pages/board.js) бере
всі активні задачі одним запитом (`getAllTasks()`) і сам розкладає
їх по колонках за одним правилом (`bucketOf`): `completed` → 
«Виконані», інакше `status` напряму («Термінові» / «Не термінові»
/ «Щоденні» / «Скасовані» / «В очікуванні») — кожна задача завжди
рівно в одній колонці. Перетягування — нативний HTML5 drag-and-drop
(`draggable`, `dragstart`/`dragover`/`drop`), без бібліотек; працює
мишкою на десктопі, сенсорні жести не підтримані (як і просили —
«перетягувати мишкою»). Картки на дошці — ті самі `TaskCard.js`,
що й на «Вхідних»/«Задачах» (`handlers.draggable: true` вмикає
перетягування лише там, де це потрібно) — включно з тим самим
dropdown «Статус», тож зі змінити статус можна і перетягуванням на
дошці, і звичайним dropdown у картці будь-де — обидва шляхи ведуть
до одного `setTaskStatus()`, тому завжди синхронізовані.

Захист маршрутів — у `renderCurrentRoute()`: захищений маршрут без
сесії редіректить на `/auth`; `/auth` із активною сесією редіректить
на `/inbox`. Це і є «захищений layout» — окремого файлу-обгортки
для нього немає, бо перевірка одного булевого поля (`route.protected`)
у вже наявній функції рендеру покриває потребу без нової абстракції
(правило №2 з PROJECT_RULES).

Кожен перехід між маршрутами супроводжується плавною появою
вмісту: `router.js` після рендеру сторінки перезапускає CSS-
анімацію `.page--enter` (див. [css/page.css](../css/page.css)) —
знімає клас, читає layout (forced reflow), додає клас знову.
Сама анімація — лише CSS (`@keyframes page-enter` у
[css/style.css](../css/style.css)); router не знає, як саме
виглядає перехід, лише коли його запускати.

## 4. Дизайн-система

Кольори та інші теми оформлення визначені як CSS-змінні
(дизайн-токени) в одному місці — блок `:root` у
[css/style.css](../css/style.css):

- `--bg`, `--bg-soft`, `--bg-raised` — фонові кольори, матові,
  з індиговим підтоном (темна тема)
- `--ink`, `--ink-dim` — кольори тексту (холодний білий / приглушений)
- `--accent`, `--accent-dim`, `--accent-soft` — акцент: яскравий
  гранатово-червоний і приглушений бордовий для м'якших станів
  (зокрема підсвітка активного пункту меню)
- `--line` — колір ліній/бордерів
- `--overlay` — підкладка за мобільним меню
- `--glow` — м'яке фонове світло позаду вмісту (`body::before`)
- `--font-display`, `--font-body` — шрифтові сімейства
- `--content-width` — максимальна ширина контенту сторінок (768px)
- `--nav-width` — максимальна ширина нав-бару (1040px, ширша за
  контент — email і кнопка «Вийти» інакше не вміщуються)
- `--shadow-card` — тінь карток (форма додавання, список задач,
  картка логіну)

Усі стилі звертаються до кольору лише через `var(--...)`; нових
кольорів «на льоту» в розмітці чи стилях компонентів не додається
(правило №4 з PROJECT_RULES). Тема — темна за замовчуванням,
перемикача світлої теми немає.

Так уже зроблено для навігації й задач: [css/nav.css](../css/nav.css),
[css/task-form.css](../css/task-form.css) та [css/task-list.css](../css/task-list.css) —
власні файли стилів відповідних компонентів. Коли з'являться інші
повторювані елементи — їхні стилі так само виносяться в окремі
файли поруч із відповідним компонентом, а кольори в них так само
беруться лише з токенів `:root`.

## 5. Що ще не реалізовано

Свідомо відсутнє на цьому етапі — заплановано на наступні кроки:

- **Supabase Storage (фото акаунта + файли в «Матеріалах»)** — код
  готовий, але не запрацює, доки не виконана міграція
  [20260825030000_setup_storage_bucket.sql](../supabase/migrations/20260825030000_setup_storage_bucket.sql)
  (розділ 1, «Supabase Storage»); до того часу і «Змінити фото» в
  меню акаунта, і «Зображення»/«Файл» у «Матеріалах» повертатимуть
  помилку бази.
- **Щоденне нагадування в Telegram** — код повністю готовий
  (`daily-reminder/`), але не запрацює, доки не пройдені ручні
  кроки з розділу 1 («Щоденне нагадування — потребує ручного
  налаштування»): секрет, деплой функції, SQL-міграція з
  розкладом pg_cron.
- **AI-фічі «Розбити на кроки» і «Що зробити зараз?»** — код готовий
  (`ai-assist/`, `aiStore.js`, кнопки в `TaskCard.js`/`inbox.js`),
  але не запрацюють, доки функцію не задеплоєно
  (`supabase functions deploy ai-assist`) — жодних нових секретів
  не треба, той самий ключ Groq, що й для розпізнавання голосу.
- **«Джерела» / «Стрічка»** — код готовий (сторінки, `feed-webhook/`,
  переклад через Groq), але не запрацює, доки не пройдені ручні
  кроки з розділу 1 («Джерела і Стрічка — потребує ручного
  налаштування»): SQL-міграція, секрет, деплой функції, і сам
  зовнішній парсер (Apify/Firecrawl тощо) — його налаштування вже
  повністю поза цим проєктом, ми лише приймаємо результат.
- **Тестування** — автоматичних тестів поки немає. Вхід через
  Google і збереження задач перевірені вручну; автоматичної
  перевірки, що RLS справді не пускає одного користувача до задач
  іншого, немає.

Ці пункти зникають зі списку в міру реалізації — і цей документ
оновлюється в тому ж кроці.

### Текст, який завжди мовою браузера/ОС, не застосунку

Весь текст, який малює сам застосунок, — українською (розділ 5,
вимога перевірена окремо). Лишається три місця, де текст малює не
застосунок, а сам браузер чи Google, — вплинути на них кодом
застосунку неможливо:

- кнопки «OK» / «Cancel» у нативних `window.alert()` /
  `window.confirm()` / `window.prompt()` — мова інтерфейсу
  браузера/ОС користувача;
- назви днів і місяців у нативному календарі `<input type="date">`
  (дедлайн задачі/підзадачі) — так само мова ОС;
- сам екран узгодження доступу Google (вибір акаунта, «Продовжити
  з...») під час входу — мова керується мовою Google-акаунта
  користувача, не застосунком.

## 6. Розгортання

Застосунок опубліковано: **https://ephemeral-daffodil-8d52cc.netlify.app**

- **Код** — [github.com/dmytroyfm-ship-it/mini-gtd-ua](https://github.com/dmytroyfm-ship-it/mini-gtd-ua),
  гілка `main`.
- **Хостинг** — Netlify, підключений напряму до цього репозиторію:
  кожен `git push` у `main` автоматично перезбирає й публікує сайт
  наново (нічого вручну заливати не треба). Білд-команди немає —
  сайт статичний; [netlify.toml](../netlify.toml) лише вказує
  Netlify віддавати `index.html` для будь-якого шляху (той самий
  SPA-fallback принцип, що й у `scripts/serve.py` для локальної
  розробки — без цього пряме відкриття `/list/next` на проді
  повернуло б 404).
- **Кожен push = окремий деплой = кредити Netlify** (безкоштовний
  тариф — обмежена місячна квота). Тому: (1) `netlify.toml` має
  правило `ignore`, яке скасовує деплой, якщо між пушами змінилась
  лише документація (`docs/`, кореневі `*.md`, `.claude/`); (2) для
  решти змін — перевіряти локально через `scripts/serve.py`
  (`localhost:4173`, Google-логін там теж працює — див. нижче) і
  пушити пачкою кількох готових змін одразу, а не після кожної
  дрібниці.
- **Google Cloud Console** і **Supabase Auth → URL Configuration**
  налаштовані на цей домен (додатково до `localhost:4173` — обидва
  лишаються дозволеними, тож локальна розробка й далі працює).

> **Google OAuth consent screen — режим Testing.** Увійти можуть
> лише акаунти, вручну додані як test users (Google Cloud Console →
> OAuth consent screen → Test users). Це свідомо: застосунок ще
> допрацьовується, посилання поки не для публічного анонсу. Перед
> тим, як ділитись посиланням із кимось новим — спершу додай його
> Google-акаунт у test users, інакше він отримає помилку доступу
> від Google.
