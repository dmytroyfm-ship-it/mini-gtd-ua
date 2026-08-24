-- Додає status до tasks — окреме поле для колонок дошки Kanban
-- (/board), незалежне від уже наявного priority (Термінові/Звичайні
-- в картці задачі — те поле не чіпаємо).
--
-- «Виконані» на дошці — це completed = true, окремого значення
-- статусу для цього немає (щоб не було двох джерел правди для
-- одного й того самого стану).
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`). RLS-політики з першої міграції
-- (auth.uid() = user_id) автоматично поширюються й на нову колонку.

alter table public.tasks
  add column if not exists status text not null default 'not_urgent'
    check (status in ('urgent', 'not_urgent', 'daily', 'cancelled', 'waiting'));

comment on column public.tasks.status is
  'Колонка дошки /board: urgent (Термінові) / not_urgent (Не термінові) / daily (Щоденні) / cancelled (Скасовані) / waiting (В очікуванні). "Виконані" — це completed = true, сюди не входить.';
