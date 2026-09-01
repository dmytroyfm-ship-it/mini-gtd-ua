-- Додає subtasks.position — явний порядок підзадач усередині задачі
-- (кнопки «↑»/«↓» у рядку підзадачі, SubtaskItem.js). Доти порядок
-- визначався лише created_at; тепер created_at лишається тай-брейком
-- (нові підзадачі, ще без унікальної позиції).
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`). RLS-політики subtasks (auth.uid() =
-- user_id) автоматично поширюються й на нову колонку.

alter table public.subtasks
  add column if not exists position integer not null default 0;

comment on column public.subtasks.position is 'Порядок підзадачі всередині задачі (0-based); менше = вище. Тай-брейк — created_at.';

-- Одноразовий backfill: проставляємо наявним рядкам позицію за
-- поточним порядком (created_at) у межах кожної задачі, щоб нічого
-- не «перемішалось» після переходу на сортування за position.
-- Виконується один раз разом із міграцією (як і решта міграцій
-- проєкту) — не запускати повторно після ручного впорядкування.
with ordered as (
  select id, row_number() over (partition by task_id order by created_at, id) - 1 as rn
  from public.subtasks
)
update public.subtasks s
set position = ordered.rn
from ordered
where ordered.id = s.id;
