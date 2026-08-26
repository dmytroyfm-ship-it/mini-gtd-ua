// Побудова дайджесту задач — спільне для daily-reminder/ (ранкове
// нагадування, будні о 9:00) і telegram-webhook/ (команда /tasks —
// той самий список на вимогу, у будь-який момент). Різний привід,
// той самий список і форматування — тому один модуль, не дві копії.
//
// Дайджест розкладає задачі по блоках:
//   • прострочені   — весь період (з урахуванням recurrence_window_days,
//                      якщо є) уже минув, due_date < сьогодні
//   • на сьогодні    — сьогодні входить у період [початок..due_date]
//   • на завтра      — завтра входить у період, а сьогодні — ще ні
//   • термінові      — status = "urgent", якщо дедлайн не потрапив
//                      у жоден з блоків вище (чи дедлайну нема);
//                      термінова задача, що вже в одному з блоків
//                      вище за датою, лишається там, лише рядок
//                      додатково позначається 🔴.
//   • інші           — решта задач, що не підпали під жоден критерій
//                      вище.
// Усі п'ять блоків показуються завжди, навіть порожні — щоб одразу
// було видно "прострочених нема", а не просто мовчазну відсутність
// секції.

import { addDays, todayInKyiv } from "./dateHelpers.ts";

export type DigestTask = {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  status: string | null;
  recurrence_window_days: number | null;
};

type Bucket = "overdue" | "today" | "tomorrow" | "urgent" | "other";

// "2026-08-25" → "25-08-2026" (ДД-ММ-РРРР).
function formatDueDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}-${month}-${year}`;
}

// Початок періоду («з 1 по 10» — due_date є кінцем, 10-те) — без
// recurrence_window_days період завжди рівно один день, той самий
// фіксований due_date.
function windowStartOf(task: DigestTask): string | null {
  if (!task.due_date) return null;
  if (!task.recurrence_window_days) return task.due_date;
  return addDays(task.due_date, -task.recurrence_window_days);
}

function bucketOf(task: DigestTask, today: string, tomorrow: string): Bucket {
  const windowStart = windowStartOf(task);
  if (windowStart && task.due_date) {
    if (task.due_date < today) return "overdue"; // весь період уже минув
    if (windowStart <= today) return "today"; // сьогодні всередині періоду
    if (windowStart <= tomorrow) return "tomorrow"; // період починається завтра (чи раніше, але не сьогодні)
  }
  if (task.status === "urgent") return "urgent";
  return "other";
}

function formatTaskLine(task: DigestTask): string {
  const marker = task.status === "urgent" ? "🔴 " : "";
  const windowStart = windowStartOf(task);
  let due = "";
  if (task.due_date && windowStart && windowStart !== task.due_date) {
    due = ` (${formatDueDate(windowStart)}–${formatDueDate(task.due_date)})`;
  } else if (task.due_date) {
    due = ` (дедлайн ${formatDueDate(task.due_date)})`;
  }
  return `• ${marker}${task.title}${due}`;
}

const BUCKET_TITLES: Record<Bucket, string> = {
  overdue: "‼️ Прострочені",
  today: "⏰ Дедлайн сьогодні",
  tomorrow: "📅 Дедлайн завтра",
  urgent: "🔴 Термінові (без дедлайну поруч)",
  other: "🗒️ Інші задачі",
};
const BUCKET_EMPTY_TEXT: Record<Bucket, string> = {
  overdue: "Прострочених нема 👍",
  today: "На сьогодні нічого нема 👍",
  tomorrow: "На завтра нічого нема 🙌",
  urgent: "Термінових нема 🎉",
  other: "Порожньо ✨",
};
const BUCKET_ORDER: Bucket[] = ["overdue", "today", "tomorrow", "urgent", "other"];

// header — рядок привітання, різний у daily-reminder ("🔔 Доброго
// ранку! ...") і /tasks у боті ("📋 Задачі зараз:" тощо) — решта
// (розкладання по блоках, форматування, посилання на застосунок)
// спільне.
export function buildDigestMessage(tasks: DigestTask[], header: string, appUrl: string): string {
  const today = todayInKyiv();
  const tomorrow = addDays(today, 1);

  const grouped: Record<Bucket, DigestTask[]> = { overdue: [], today: [], tomorrow: [], urgent: [], other: [] };
  for (const task of tasks) grouped[bucketOf(task, today, tomorrow)].push(task);
  // Найстаріші прострочені — першими, щоб одразу впадали в очі.
  grouped.overdue.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  const sections = BUCKET_ORDER.map((bucket) => {
    const body = grouped[bucket].length > 0 ? grouped[bucket].map(formatTaskLine).join("\n") : BUCKET_EMPTY_TEXT[bucket];
    return `${BUCKET_TITLES[bucket]}:\n${body}`;
  });

  return `${header}\n\n${sections.join("\n\n")}\n\nНатисніть сюди, щоб відкрити планувальник: ${appUrl}`;
}
