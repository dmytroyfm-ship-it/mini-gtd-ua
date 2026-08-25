-- Щоденний виклик Edge Function daily-reminder о 09:00 за київським
-- часом (нагадування в Telegram про прострочені задачі й задачі на
-- сьогодні — supabase/functions/daily-reminder/).
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`). ПЕРЕД запуском заміни
-- 'REPLACE_WITH_YOUR_CRON_SECRET' нижче на свій рядок (наприклад,
-- отриманий через `openssl rand -hex 24`) — і той самий рядок
-- потім задати як секрет функції:
--   supabase secrets set CRON_SECRET=<той_самий_рядок>
-- Значення в цьому файлі — лише для запуску міграції; сам файл
-- лишається в git, тож справжній секрет тут писати не можна.
--
-- pg_cron рахує час у UTC і не знає про літній/зимовий час — 06:00
-- UTC відповідає 09:00 в Україні влітку (EEST, UTC+3) і 08:00 взимку
-- (EET, UTC+2). Для щоденного нагадування ця різниця в годину не
-- критична; якщо захочеш точності — розклад можна підправити двічі
-- на рік через cron.alter_job().

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'daily-reminder-9am-kyiv',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://ufjkundsaelfstfxslck.supabase.co/functions/v1/daily-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REPLACE_WITH_YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
