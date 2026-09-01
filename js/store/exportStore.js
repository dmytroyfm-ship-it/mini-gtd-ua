// Експорт усіх даних користувача одним JSON-файлом («Експортувати
// дані» в меню акаунта, AccountMenu.js) — резервна копія на випадок
// невдалої SQL-міграції чи проблем з акаунтом (у Supabase на
// безкоштовному тарифі автоматичних бекапів немає).
//
// RLS кожної таблиці (auth.uid() = user_id) сам обмежує вибірку
// рядками поточного користувача — тут окремо фільтрувати не треба,
// той самий принцип, що й у решті js/store/*.
//
// Компонент (AccountMenu.js) сам робить із цього Blob і завантаження
// файлу — це вже взаємодія з браузером, не робота з даними
// (PROJECT_RULES, п.6).

import { supabase } from "../lib/supabaseClient.js";

// Усі таблиці, де є дані користувача. Порожня таблиця повертає []
// — у файл потрапляє порожній масив, це нормально.
const TABLES = ["tasks", "subtasks", "materials", "comments", "telegram_links", "sources", "feed_items"];

async function dump(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return data ?? [];
}

// Повертає { filename, data }: data — плоский об'єкт із масивом
// рядків кожної таблиці плюс мітка часу; filename — з локальною
// датою (не UTC), щоб збігалася з тим, який сьогодні день у
// користувача.
export async function exportAllData() {
  const dumps = await Promise.all(TABLES.map(dump));

  const data = { exported_at: new Date().toISOString() };
  TABLES.forEach((table, index) => {
    data[table] = dumps[index];
  });

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return { filename: `mini-gtd-backup-${stamp}.json`, data };
}
