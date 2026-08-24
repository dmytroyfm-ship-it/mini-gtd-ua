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
// обхід RLS і має лишатись лише на довіреному сервері, якого в
// цьому проєкті поки немає.

export const SUPABASE_URL = "https://ufjkundsaelfstfxslck.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_KqRH9UTvUl_Nn2rXIo0oAQ_xsDh-t0f";
