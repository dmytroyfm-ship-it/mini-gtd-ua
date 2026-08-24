-- Таблиці subtasks (підзадачі / Next Actions) і materials
-- (прикріплені посилання/файли) — обидві прив'язані до задачі з
-- tasks. Той самий підхід до RLS, що й у
-- supabase/migrations/20260824000000_create_tasks_table.sql.
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`, якщо ініціалізований Supabase CLI).
-- Застосунок (js/store/*) до цих таблиць ще не підключений — це
-- наступний окремий крок.

create extension if not exists pgcrypto;

-- ==========================================================
-- subtasks — конкретні кроки всередині задачі
-- ==========================================================

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.subtasks is 'Підзадачі (Next Actions) — конкретні кроки всередині задачі з tasks.';

-- Типовий запит — «усі підзадачі задачі X для поточного користувача».
create index if not exists subtasks_task_id_user_id_idx
  on public.subtasks (task_id, user_id);

alter table public.subtasks enable row level security;

create policy "Users can view their own subtasks"
  on public.subtasks
  for select
  using (auth.uid() = user_id);

-- INSERT/UPDATE додатково перевіряють, що task_id справді належить
-- тому самому користувачу — без цього можна було б прив'язати свою
-- підзадачу до чужої (недоступної для читання) задачі.
create policy "Users can insert subtasks on their own tasks"
  on public.subtasks
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

create policy "Users can update their own subtasks"
  on public.subtasks
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

create policy "Users can delete their own subtasks"
  on public.subtasks
  for delete
  using (auth.uid() = user_id);

-- ==========================================================
-- materials — прикріплені посилання/файли до задачі
-- ==========================================================

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('link', 'file', 'notion', 'gdrive')),
  url text not null,
  title text not null,
  created_at timestamptz not null default now()
);

comment on table public.materials is 'Матеріали (посилання/файли), прикріплені до задачі з tasks.';
comment on column public.materials.type is 'link / file / notion / gdrive';

create index if not exists materials_task_id_user_id_idx
  on public.materials (task_id, user_id);

alter table public.materials enable row level security;

create policy "Users can view their own materials"
  on public.materials
  for select
  using (auth.uid() = user_id);

create policy "Users can insert materials on their own tasks"
  on public.materials
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

create policy "Users can update their own materials"
  on public.materials
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

create policy "Users can delete their own materials"
  on public.materials
  for delete
  using (auth.uid() = user_id);
