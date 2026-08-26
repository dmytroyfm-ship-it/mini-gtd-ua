-- Виправляє прогалину в місячному повторенні: раніше наступний
-- дедлайн рахувався від ДНЯ ПОПЕРЕДНЬОГО due_date, тож задача на
-- 31 число після одного короткого місяця (напр. вересня, 30 днів)
-- назавжди "просідала" на 30-те й більше ніколи не поверталась до
-- 31-го, навіть у місяцях, де воно є. Новий стовпець запам'ятовує
-- оригінальне число місяця (anchor) окремо від фактичного due_date —
-- nextDueDate() тепер завжди рахує від нього.
--
-- Виконати самостійно в Supabase SQL Editor (як і решта міграцій).

alter table tasks
  add column recurrence_anchor_day integer,
  add constraint recurrence_anchor_day_range
    check (recurrence_anchor_day is null or recurrence_anchor_day between 1 and 31);
