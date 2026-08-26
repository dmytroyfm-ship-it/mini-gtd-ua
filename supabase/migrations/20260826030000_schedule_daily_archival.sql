-- Щоденне автоперенесення виконаних і скасованих задач у «Історію»
-- (list = "archive") о 22:30 за київським часом.
--
-- На відміну від daily-reminder (той потребує Edge Function, бо
-- звертається до Telegram API) — тут просто одне UPDATE по таблиці,
-- без зовнішніх викликів. pg_cron виконує завдання від імені того,
-- хто його запланував (звичайно роль бази/власник), що вже має
-- повний доступ до таблиці — RLS не заважає, service_role key чи
-- Edge Function не потрібні взагалі.
--
-- pg_cron рахує час у UTC і не знає про літній/зимовий час — 19:30
-- UTC відповідає 22:30 в Україні влітку (EEST, UTC+3) і 23:30 взимку
-- (EET, UTC+2). Той самий компроміс, що й у daily-reminder
-- (20260825010000) — різниця в годину для щоденного перенесення не
-- критична.
--
-- Виконати самостійно в Supabase SQL Editor (extension pg_cron уже
-- увімкнено попередньою міграцією daily-reminder).

select cron.schedule(
  'archive-completed-cancelled-2230-kyiv',
  '30 19 * * *',
  $$
  update public.tasks
  set list = 'archive'
  where deleted_at is null
    and list <> 'archive'
    and (completed = true or status = 'cancelled');
  $$
);
