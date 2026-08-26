-- Щоденне нагадування (daily-reminder) — лише в будні (пн-пт),
-- користувач не працює в суботу/неділю, тож не варто турбувати
-- нагадуванням про задачі й у ці дні.
--
-- Просто перепланування наявного завдання з іншим cron-виразом
-- ('1-5' у полі дня тижня = понеділок-пʼятниця; pg_cron рахує
-- 0 і 7 як неділю, 1-6 — пн-сб, стандартний vixie-cron синтаксис).
-- Час (06:00 UTC = 09:00 в Україні влітку) не змінюється.
--
-- ПЕРЕД запуском заміни 'REPLACE_WITH_YOUR_CRON_SECRET' нижче на
-- той самий рядок, що вже задано як секрет функції (CRON_SECRET) —
-- той самий принцип, що й у 20260825010000_setup_daily_reminder_cron.sql.
--
-- Виконати самостійно в Supabase SQL Editor.

select cron.unschedule('daily-reminder-9am-kyiv');

select cron.schedule(
  'daily-reminder-9am-kyiv',
  '0 6 * * 1-5',
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
