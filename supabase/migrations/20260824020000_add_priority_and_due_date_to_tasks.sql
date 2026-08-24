-- Додає priority (пріоритет) і due_date (дедлайн) до tasks — для
-- нової картки задачі: два dropdown (список і пріоритет) + date
-- picker для дедлайну.
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`). RLS-політики з першої міграції
-- (auth.uid() = user_id) автоматично поширюються й на нові
-- колонки — окремих політик тут не треба.

alter table public.tasks
  add column if not exists priority text not null default 'normal'
    check (priority in ('urgent', 'normal'));

alter table public.tasks
  add column if not exists due_date date;

comment on column public.tasks.priority is 'urgent (Термінові) / normal (Звичайні)';
comment on column public.tasks.due_date is 'Дедлайн задачі; NULL = без дедлайну.';
