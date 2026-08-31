-- Щогодинний виклик Edge Function feed-poll — сама читає sources
-- (YouTube/Telegram/RSS) і пересилає нові пости в feed-webhook
-- (supabase/functions/feed-poll/, supabase/functions/_shared/feedParse.ts).
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`). ПЕРЕД запуском заміни
-- 'REPLACE_WITH_YOUR_CRON_SECRET' нижче на той самий рядок, що вже
-- задано як секрет CRON_SECRET (той самий секрет, що й у
-- daily-reminder — 20260825010000_setup_daily_reminder_cron.sql,
-- якщо він там уже заданий, тут підставити той самий рядок):
--   supabase secrets set CRON_SECRET=<той_самий_рядок>
-- Значення в цьому файлі — лише для запуску міграції; сам файл
-- лишається в git, тож справжній секрет тут писати не можна.
--
-- Щогодини (о хвилині 0) — компроміс між свіжістю стрічки й
-- кількістю запитів до RSSHub/YouTube; за потреби частіше/рідше —
-- поправити вираз через cron.alter_job(), як і для daily-reminder.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'feed-poll-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://ufjkundsaelfstfxslck.supabase.co/functions/v1/feed-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REPLACE_WITH_YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
