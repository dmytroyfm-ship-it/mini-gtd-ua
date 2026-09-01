-- «Стрічка» тимчасово вимкнена (js/config.js: FEATURES.feed = false)
-- — знімаємо щогодинне завдання feed-poll, щоб не витрачати виклики
-- Edge Function і, головне, платні виклики Apify для Instagram
-- ($0.0027/пост), поки фіча не потрібна.
--
-- Таблиці sources / feed_items і самі Edge Functions (feed-poll,
-- feed-webhook) НЕ чіпаємо — вони нічого не коштують, поки їх ніхто
-- не викликає, а дані підписок/постів лишаються цілими для швидкого
-- повернення.
--
-- Через фільтр по jobname (а не голий cron.unschedule('...')) —
-- міграція безпечна навіть якщо завдання вже знято чи ніколи не
-- планувалось: просто нічого не зробить, без помилки.
--
-- ПОВЕРНУТИ «Стрічку»:
--   1. js/config.js — FEATURES.feed = true;
--   2. знову виконати
--      supabase/migrations/20260831000000_setup_feed_poll_cron.sql
--      (cron.schedule з тим самим імʼям 'feed-poll-hourly' просто
--      перезапише розклад; не забути підставити CRON_SECRET, як і
--      першого разу).
--
-- Виконати самостійно в Supabase SQL Editor.

select cron.unschedule(jobid)
from cron.job
where jobname = 'feed-poll-hourly';
