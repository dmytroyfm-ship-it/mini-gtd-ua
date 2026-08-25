-- Таблиця comments — коментарі до задачі (детальний перегляд,
-- /task/:id, CommentsBlock.js). Той самий підхід до RLS, що й у
-- subtasks/materials (20260824010000): INSERT додатково перевіряє,
-- що task_id належить тому самому користувачу.
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`).

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

comment on table public.comments is 'Коментарі до задачі (детальний перегляд, /task/:id).';

create index if not exists comments_task_id_user_id_idx
  on public.comments (task_id, user_id);

alter table public.comments enable row level security;

create policy "Users can view their own comments"
  on public.comments
  for select
  using (auth.uid() = user_id);

create policy "Users can insert comments on their own tasks"
  on public.comments
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

create policy "Users can delete their own comments"
  on public.comments
  for delete
  using (auth.uid() = user_id);
