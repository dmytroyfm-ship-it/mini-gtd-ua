-- Таблиця telegram_links — прив'язка Telegram-чату користувача до
-- його user_id, для інтеграції з ботом (js/pages/integrations.js,
-- supabase/functions/telegram-webhook/).
--
-- Прив'язка йде через одноразовий код: користувач тисне «Згенерувати
-- код» на сторінці «Інтеграції» (записує link_code у свій рядок),
-- потім надсилає боту команду /start <код> — Edge Function знаходить
-- рядок за кодом (не за user_id — на той момент вона ще не знає,
-- хто пише) і заповнює telegram_chat_id.
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`, якщо ініціалізований Supabase CLI).

create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_chat_id bigint unique,
  telegram_username text,
  telegram_first_name text,
  link_code text unique,
  link_code_expires_at timestamptz,
  linked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.telegram_links is
  'Прив''язка Telegram-чату (telegram_chat_id) до user_id — для бота, що створює задачі з Telegram.';
comment on column public.telegram_links.link_code is
  'Тимчасовий код прив''язки (/start <код>); NULL, коли вже прив''язано.';
comment on column public.telegram_links.telegram_chat_id is
  'chat.id з Telegram — після прив''язки саме за ним Edge Function знаходить user_id.';
comment on column public.telegram_links.telegram_username is
  'Telegram @username на момент прив''язки (може бути NULL — не в усіх він є); лише для показу в UI.';
comment on column public.telegram_links.telegram_first_name is
  'Ім''я з профілю Telegram на момент прив''язки; лише для показу в UI.';

-- Пошук за chat_id (кожне вхідне повідомлення) і за link_code (лише
-- команда /start) — обидва мають бути швидкими.
create index if not exists telegram_links_chat_id_idx
  on public.telegram_links (telegram_chat_id);
create index if not exists telegram_links_link_code_idx
  on public.telegram_links (link_code);

alter table public.telegram_links enable row level security;

-- Клієнт (сторінка «Інтеграції») керує лише власним рядком — генерує
-- код, бачить статус, відв'язує. Сама Edge Function читає й пише в
-- обхід RLS через service_role key (довірений сервер, secret key —
-- лише в секретах Supabase-функції, не в цьому застосунку).
create policy "Users can view their own telegram link"
  on public.telegram_links
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own telegram link"
  on public.telegram_links
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own telegram link"
  on public.telegram_links
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own telegram link"
  on public.telegram_links
  for delete
  using (auth.uid() = user_id);
