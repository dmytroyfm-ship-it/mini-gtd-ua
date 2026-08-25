// Щоденне нагадування в Telegram (/functions/v1/daily-reminder).
//
// Не приймає повідомлень від Telegram (на відміну від
// telegram-webhook/) — сама викликається щодня за розкладом
// (pg_cron + pg_net, див.
// supabase/migrations/20260825010000_setup_daily_reminder_cron.sql)
// і сама надсилає повідомлення користувачам.
//
// Логіка: серед активних (не в кошику, не виконаних) задач з
// дедлайном — які прострочені (due_date < сьогодні) і які на
// сьогодні (due_date = сьогодні); якщо є хоч одна — надсилає
// повідомлення в Telegram-чат, прив'язаний до цього user_id
// (telegram_links, той самий принцип, що й у telegram-webhook/).
// Немає прив'язки чи взагалі нема таких задач — мовчки нічого не
// надсилає.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
// Куди веде "Натисніть сюди" в повідомленні — публічна адреса
// сайту. Дефолт співпадає з поточним Netlify-деплоєм; якщо домен
// колись зміниться, це можна перевизначити секретом APP_URL, не
// чіпаючи код.
const APP_URL = Deno.env.get("APP_URL") ?? "https://ephemeral-daffodil-8d52cc.netlify.app";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Українська множина (1 задача / 2-4 задачі / 5+ задач) — тексту
// в проєкті завжди українською (PROJECT_RULES, п.1), а не лише
// найпростішого "5 задач" незалежно від числа.
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

// "Сьогодні" — за київським часом, не UTC (сервер завжди в UTC,
// а нагадування — для користувача в Україні). en-CA форматує рівно
// як YYYY-MM-DD, зручно порівнювати з датою в базі (тип date).
function todayInKyiv(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
}

Deno.serve(async (req) => {
  // Викликає лише pg_cron (див. міграцію) — секрет у заголовку не
  // дає будь-кому зі знанням URL функції розсилати нагадування на
  // вимогу.
  if (CRON_SECRET) {
    const incoming = req.headers.get("x-cron-secret");
    if (incoming !== CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
  }

  const today = todayInKyiv();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("user_id, due_date")
    .is("deleted_at", null)
    .eq("completed", false)
    .not("due_date", "is", null)
    .lte("due_date", today);

  if (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }

  const byUser = new Map<string, { today: number; overdue: number }>();
  for (const task of tasks ?? []) {
    const bucket = byUser.get(task.user_id) ?? { today: 0, overdue: 0 };
    if (task.due_date === today) bucket.today += 1;
    else bucket.overdue += 1;
    byUser.set(task.user_id, bucket);
  }

  if (byUser.size === 0) {
    return new Response("ok: no tasks due");
  }

  const { data: links, error: linksError } = await supabase
    .from("telegram_links")
    .select("user_id, telegram_chat_id")
    .not("telegram_chat_id", "is", null)
    .in("user_id", Array.from(byUser.keys()));

  if (linksError) {
    console.error(linksError);
    return new Response("error", { status: 500 });
  }

  let sent = 0;
  for (const link of links ?? []) {
    const bucket = byUser.get(link.user_id);
    if (!bucket) continue;

    const text =
      `🔔 Доброго ранку! У вас ${bucket.today} ` +
      `${pluralize(bucket.today, "задача", "задачі", "задач")} на сьогодні і ` +
      `${bucket.overdue} ${pluralize(bucket.overdue, "прострочена", "прострочені", "прострочених")}. ` +
      `Натисніть сюди, щоб відкрити планувальник: ${APP_URL}`;

    await sendMessage(link.telegram_chat_id as number, text);
    sent += 1;
  }

  return new Response(`ok: sent ${sent}`);
});
