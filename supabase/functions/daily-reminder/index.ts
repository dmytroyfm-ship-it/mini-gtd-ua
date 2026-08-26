// Щоденне нагадування в Telegram (/functions/v1/daily-reminder).
//
// Не приймає повідомлень від Telegram (на відміну від
// telegram-webhook/) — сама викликається щодня о 9:00 у будні
// (пн-пт, pg_cron + pg_net, див.
// supabase/migrations/20260825010000_setup_daily_reminder_cron.sql
// і 20260826040000_daily_reminder_weekdays_only.sql — користувач не
// працює в суботу/неділю) і сама надсилає повідомлення користувачам.
//
// Бере з `tasks` усі активні (не виконані, не в кошику) задачі зі
// списків «Вхідні» й «Задачі» (list: inbox/next — те, що справді на
// порядку денному; «Колись», «Читати/Дивитись» і «Історія» свідомо
// відкладені самим користувачем, у дайджест не потрапляють) і для
// кожного user_id будує дайджест — саму побудову (розкладання по
// блоках, форматування) робить `_shared/dailyDigest.ts`, спільний з
// командою /tasks у telegram-webhook/ (той самий список на вимогу).
// Немає жодної задачі в цих двох списках чи нема прив'язки Telegram
// — мовчки нічого не надсилає.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildDigestMessage, type DigestTask } from "../_shared/dailyDigest.ts";

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

// Telegram обмежує повідомлення 4096 символами — для особистого
// використання список навряд чи наблизиться до межі, але про
// всяк випадок акуратно обрізаємо, а не даємо Telegram API
// відхилити весь виклик мовчки.
const MAX_MESSAGE_LENGTH = 3800;

async function sendMessage(chatId: number, text: string) {
  const body = text.length > MAX_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_MESSAGE_LENGTH)}\n\n… список скорочено, повний — у застосунку.`
    : text;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body }),
  });
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

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, user_id, title, due_date, status, recurrence_window_days")
    .is("deleted_at", null)
    .eq("completed", false)
    .in("list", ["inbox", "next"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }

  const byUser = new Map<string, DigestTask[]>();
  for (const task of (tasks ?? []) as DigestTask[]) {
    const list = byUser.get(task.user_id) ?? [];
    list.push(task);
    byUser.set(task.user_id, list);
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
    const userTasks = byUser.get(link.user_id);
    if (!userTasks || userTasks.length === 0) continue;

    const message = buildDigestMessage(userTasks, "🔔 Доброго ранку! Ваші задачі:", APP_URL);
    await sendMessage(link.telegram_chat_id as number, message);
    sent += 1;
  }

  return new Response(`ok: sent ${sent}`);
});
