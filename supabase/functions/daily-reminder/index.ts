// Щоденне нагадування в Telegram (/functions/v1/daily-reminder).
//
// Не приймає повідомлень від Telegram (на відміну від
// telegram-webhook/) — сама викликається щодня за розкладом
// (pg_cron + pg_net, див.
// supabase/migrations/20260825010000_setup_daily_reminder_cron.sql)
// і сама надсилає повідомлення користувачам.
//
// Формує повний список задач на день — усі активні (не в кошику, не
// виконані) задачі зі списків «Вхідні» й «Задачі» (list: inbox/next
// — те, що справді на порядку денному; «Колись», «Читати/Дивитись»
// і «Архів» свідомо відкладені самим користувачем, у щоденний
// дайджест не потрапляють), розкладені по блоках:
//   • прострочені   — due_date < сьогодні
//   • на сьогодні    — due_date = сьогодні
//   • на завтра      — due_date = завтра ("до дедлайну 1 день")
//   • термінові      — status = "urgent", якщо дедлайн не потрапив
//                      у жоден з блоків вище (чи дедлайну нема);
//                      термінова задача, що вже в одному з блоків
//                      вище за датою, лишається там, лише рядок
//                      додатково позначається 🔴.
//   • інші           — решта задач із «Вхідні»/«Задачі», що не
//                      підпали під жоден критерій вище.
// Немає жодної задачі в цих двох списках чи нема прив'язки Telegram
// — мовчки нічого не надсилає.

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

// "Сьогодні"/"завтра" — за київським часом, не UTC (сервер завжди в
// UTC, а нагадування — для користувача в Україні). en-CA форматує
// рівно як YYYY-MM-DD, зручно порівнювати з датою в базі (тип date).
function todayInKyiv(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2026-08-25" → "25.08" — компактніше в списку, ніж повна дата.
function formatDueDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}.${month}`;
}

type Task = { id: string; user_id: string; title: string; due_date: string | null; status: string | null };
type Bucket = "overdue" | "today" | "tomorrow" | "urgent" | "other";

function bucketOf(task: Task, today: string, tomorrow: string): Bucket {
  if (task.due_date && task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  if (task.due_date === tomorrow) return "tomorrow";
  if (task.status === "urgent") return "urgent";
  return "other";
}

function formatTaskLine(task: Task): string {
  const marker = task.status === "urgent" ? "🔴 " : "";
  const due = task.due_date ? ` (дедлайн ${formatDueDate(task.due_date)})` : "";
  return `• ${marker}${task.title}${due}`;
}

const BUCKET_TITLES: Record<Bucket, string> = {
  overdue: "‼️ Прострочені",
  today: "⏰ Дедлайн сьогодні",
  tomorrow: "📅 Дедлайн завтра",
  urgent: "🔴 Термінові (без дедлайну поруч)",
  other: "🗒️ Інші задачі",
};
// Усі п'ять блоків показуються завжди, навіть порожні (за проханням
// користувача — щоб одразу було видно "прострочених нема", а не
// просто мовчазну відсутність секції).
const BUCKET_EMPTY_TEXT: Record<Bucket, string> = {
  overdue: "Прострочених нема 👍",
  today: "На сьогодні нічого нема 👍",
  tomorrow: "На завтра нічого нема",
  urgent: "Термінових нема",
  other: "Порожньо",
};
const BUCKET_ORDER: Bucket[] = ["overdue", "today", "tomorrow", "urgent", "other"];

function buildMessage(tasks: Array<Task & { __bucket: Bucket }>): string {
  const grouped: Record<Bucket, Task[]> = { overdue: [], today: [], tomorrow: [], urgent: [], other: [] };
  for (const task of tasks) grouped[task.__bucket].push(task);
  // Найстаріші прострочені — першими, щоб одразу впадали в очі.
  grouped.overdue.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  const sections = BUCKET_ORDER.map((bucket) => {
    const body = grouped[bucket].length > 0 ? grouped[bucket].map(formatTaskLine).join("\n") : BUCKET_EMPTY_TEXT[bucket];
    return `${BUCKET_TITLES[bucket]}:\n${body}`;
  });

  return (
    `🔔 Доброго ранку! Ваші задачі:\n\n${sections.join("\n\n")}\n\n` +
    `Натисніть сюди, щоб відкрити планувальник: ${APP_URL}`
  );
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
  const tomorrow = addDays(today, 1);

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, user_id, title, due_date, status")
    .is("deleted_at", null)
    .eq("completed", false)
    .in("list", ["inbox", "next"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }

  const byUser = new Map<string, Array<Task & { __bucket: Bucket }>>();
  for (const task of (tasks ?? []) as Task[]) {
    const bucket = bucketOf(task, today, tomorrow);
    const list = byUser.get(task.user_id) ?? [];
    list.push({ ...task, __bucket: bucket });
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

    await sendMessage(link.telegram_chat_id as number, buildMessage(userTasks));
    sent += 1;
  }

  return new Response(`ok: sent ${sent}`);
});
