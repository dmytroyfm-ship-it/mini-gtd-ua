-- Період дедлайну для повторюваних задач (weekly/monthly) — «з 1 по
-- 10 число», «з понеділка по середу» тощо, замість лише одного
-- фіксованого дня. Дедлайн (due_date) лишається кінцем періоду;
-- новий стовпець зберігає, скільки днів ДО дедлайну відкривається
-- вікно. NULL — як і раніше, точно один фіксований день, поведінка
-- вже наявних задач не міняється.
--
-- Виконати самостійно в Supabase SQL Editor (як і решта міграцій).

alter table tasks
  add column recurrence_window_days integer,
  add constraint recurrence_window_days_non_negative
    check (recurrence_window_days is null or recurrence_window_days >= 0);
