-- Додає recurrence до tasks — повторювані задачі (щодня/щотижня/
-- щомісяця). NULL = не повторюється (більшість задач).
--
-- Механіка — не окрема таблиця й не cron, а найпростіше, що
-- вирішує задачу: коли позначаєш повторювану задачу виконаною
-- (js/store/taskStore.js, completeTask()), одразу створюється нова
-- задача з тим самим recurrence на наступну дату — та сама
-- add Task-логіка, без фонових завдань. Стара задача лишається
-- виконаною назавжди (історія повторень), а не скидається назад у
-- невиконаний стан.
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`).

alter table public.tasks
  add column if not exists recurrence text
    check (recurrence in ('daily', 'weekly', 'monthly'));

comment on column public.tasks.recurrence is
  'daily / weekly / monthly / NULL (не повторюється). Позначення виконаною створює нову задачу на наступну дату — див. taskStore.completeTask().';
