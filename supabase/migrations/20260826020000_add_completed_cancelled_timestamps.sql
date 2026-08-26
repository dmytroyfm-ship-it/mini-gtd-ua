-- Момент виконання/скасування задачі — окремо від updated_at, який
-- оновлюється при БУДЬ-ЯКІЙ зміні рядка (в т.ч. пізніше, коли
-- щоденне автоперенесення в Історію (20260826030000) саме й зачепить
-- updated_at, стерши точний час виконання/скасування). Без цих
-- стовпців звіт по датах у «Історії» був би неможливий.
--
-- Виконати самостійно в Supabase SQL Editor (як і решта міграцій).

alter table tasks
  add column completed_at timestamptz,
  add column cancelled_at timestamptz;

-- Бекфіл для вже наявних виконаних/скасованих задач — точного
-- моменту ми не знаємо, updated_at лишається найкращим наближенням.
update tasks set completed_at = updated_at where completed = true and completed_at is null;
update tasks set cancelled_at = updated_at where status = 'cancelled' and cancelled_at is null;
