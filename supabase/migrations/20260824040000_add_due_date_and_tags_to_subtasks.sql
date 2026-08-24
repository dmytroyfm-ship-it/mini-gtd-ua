-- Додає due_date і tags до subtasks — для сторінки детального
-- перегляду задачі (/task/:id), де в кожної підзадачі є власний
-- міні-дедлайн і власні міні-теги.
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`). RLS-політики з другої міграції
-- (auth.uid() = user_id) автоматично поширюються й на нові колонки.

alter table public.subtasks
  add column if not exists due_date date;

alter table public.subtasks
  add column if not exists tags text[] not null default '{}';

comment on column public.subtasks.due_date is 'Дедлайн підзадачі; NULL = без дедлайну.';
comment on column public.subtasks.tags is 'Теги підзадачі, напр. ["@глибока_робота"].';
