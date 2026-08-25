// Публічні налаштування Supabase.
//
// Project URL і publishable key призначені саме для коду в браузері
// й НЕ є секретом — Supabase сам це підтверджує:
// https://supabase.com/docs/guides/api/api-keys
// Реальний захист даних — правила RLS у
// supabase/migrations/20260824000000_create_tasks_table.sql, а не
// секретність цих значень.
//
// НІКОЛИ не додавайте сюди secret key (раніше — "service_role") —
// на відміну від publishable key, він дає повний доступ до бази в
// обхід RLS і має лишатись лише на довіреному сервері. Такий сервер
// у проєкті тепер є — supabase/functions/telegram-webhook/, secret
// key живе лише в секретах цієї Edge Function, а не тут.

export const SUPABASE_URL = "https://ufjkundsaelfstfxslck.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KqRH9UTvUl_Nn2rXIo0oAQ_xsDh-t0f";

// Ім'я Telegram-бота (без @) — публічне, не секрет: показується
// будь-кому, хто відкриє чат із ботом. Замінити на своє після
// створення бота через @BotFather (докладніше —
// docs/ARCHITECTURE.md, розділ про Telegram-інтеграцію).
export const TELEGRAM_BOT_USERNAME = "mini_gtd_bot";
