-- Таблиці sources («Джерела», /sources) і feed_items («Стрічка»,
-- /feed) — див. js/pages/sources.js, js/pages/feed.js,
-- supabase/functions/feed-webhook/.
--
-- sources — керується користувачем напряму (звичайний RLS-захищений
-- CRUD, як і всюди в проєкті). feed_items — навпаки, вставляються
-- лише Edge Function feed-webhook (service_role, в обхід RLS): туди
-- зовнішній парсер (Apify/Firecrawl) шле пости конкретного джерела
-- за його id (видно на сторінці «Джерела» — «ID для вебхука»).
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`).

create extension if not exists pgcrypto;

-- ==========================================================
-- sources — підписки користувача (платформа + @handle/URL)
-- ==========================================================

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'telegram', 'instagram', 'threads', 'reddit', 'twitter', 'rss')),
  handle text not null,
  created_at timestamptz not null default now()
);

comment on table public.sources is 'Джерела контенту (сторінка «Джерела») — платформа + @handle/URL. id кожного рядка — те, що зовнішній парсер (Apify/Firecrawl) підставляє як source_id у feed-webhook.';

create index if not exists sources_user_id_idx on public.sources (user_id);

alter table public.sources enable row level security;

create policy "Users can view their own sources"
  on public.sources for select using (auth.uid() = user_id);

create policy "Users can insert their own sources"
  on public.sources for insert with check (auth.uid() = user_id);

create policy "Users can delete their own sources"
  on public.sources for delete using (auth.uid() = user_id);

-- ==========================================================
-- feed_items — пости, зібрані з sources (сторінка «Стрічка»)
-- ==========================================================

create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  external_id text,
  author text,
  title text not null,
  text text,
  title_uk text,
  text_uk text,
  url text not null,
  published_at timestamptz,
  status text not null default 'new' check (status in ('new', 'skipped', 'added')),
  created_at timestamptz not null default now()
);

comment on table public.feed_items is 'Пости з джерел (сторінка «Стрічка») — вставляються лише через Edge Function feed-webhook.';
comment on column public.feed_items.title_uk is 'Заголовок після перекладу (Groq) — саме він показується в UI; якщо переклад не вдався, UI сам підставляє оригінальний title.';
comment on column public.feed_items.text_uk is 'Текст після перекладу — те саме, що title_uk, але для тексту поста.';
comment on column public.feed_items.status is 'new — у стрічці; skipped — «Пропустити»; added — перетворено на задачу («В Inbox»). Стрічка (feedStore.getFeedItems) показує лише new.';

-- Дедуп: той самий пост від того самого джерела (external_id від
-- парсера — id відео/твіту/публікації) не повинен потрапити в базу
-- вдруге, якщо парсер надішле його ще раз.
create unique index if not exists feed_items_source_external_idx
  on public.feed_items (source_id, external_id)
  where external_id is not null;

create index if not exists feed_items_user_id_status_idx
  on public.feed_items (user_id, status);

alter table public.feed_items enable row level security;

-- INSERT-політики немає навмисно — рядки вставляє лише
-- feed-webhook (service_role, в обхід RLS); з клієнта в цю таблицю
-- нічого не пишуть.
create policy "Users can view their own feed items"
  on public.feed_items for select using (auth.uid() = user_id);

create policy "Users can update their own feed items"
  on public.feed_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can delete their own feed items"
  on public.feed_items for delete using (auth.uid() = user_id);
