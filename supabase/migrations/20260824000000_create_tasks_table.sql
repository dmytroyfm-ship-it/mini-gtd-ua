-- Таблиця tasks — задачі Mini GTD UA.
--
-- Розраховано на Supabase (Postgres із вбудованою auth.users і
-- функцією auth.uid() у політиках RLS нижче). Якщо ваша база —
-- не Supabase, посилання на auth.users(id) і виклики auth.uid()
-- треба замінити на механізм автентифікації вашої БД.
--
-- Застосувати: Supabase Dashboard → SQL Editor → вставити й
-- виконати. Або, якщо в проєкті вже ініціалізований Supabase CLI:
--   supabase db push
--
-- Це лише визначення схеми. Сам застосунок (js/store/taskStore.js,
-- js/store/authStore.js) поки що НЕ підключений до цієї бази —
-- це наступний окремий крок (додати клієнт Supabase, реальний
-- Google OAuth через Supabase Auth, змінити store-файли на запити
-- до БД замість масиву в пам'яті).

-- gen_random_uuid() для id
create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  note text not null default '',
  list text not null default 'inbox'
    check (list in ('inbox', 'next', 'read_watch', 'someday', 'archive')),
  tags text[] not null default '{}',
  completed boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tasks is 'Задачі користувачів Mini GTD UA.';
comment on column public.tasks.list is 'inbox / next / read_watch / someday / archive';
comment on column public.tasks.deleted_at is 'NULL = активна задача; заповнено = у кошику (м''яке видалення)';

-- Кожен запит до задач фільтрує за user_id (і майже завжди ще й
-- за list, виключаючи видалені) — індекси під ці шаблони запитів.
create index if not exists tasks_user_id_idx
  on public.tasks (user_id);

create index if not exists tasks_user_id_list_idx
  on public.tasks (user_id, list)
  where deleted_at is null;

-- updated_at оновлюється автоматично при кожному UPDATE
-- (у Postgres, на відміну від created_at, це не робиться просто
-- значенням за замовчуванням — потрібен тригер).
create or replace function public.set_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute function public.set_tasks_updated_at();

-- === Row Level Security ===
-- Без "enable row level security" самі по собі політики нижче
-- нічого не приховують — РЛС для таблиці треба явно увімкнути.
-- Після цього кожна дія (SELECT/INSERT/UPDATE/DELETE) дозволена
-- лише для рядків, де user_id дорівнює id поточного авторизованого
-- користувача (auth.uid()) — інакше будь-хто з доступом до таблиці
-- побачив би чужі задачі.

alter table public.tasks enable row level security;

create policy "Users can view their own tasks"
  on public.tasks
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tasks"
  on public.tasks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on public.tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on public.tasks
  for delete
  using (auth.uid() = user_id);
