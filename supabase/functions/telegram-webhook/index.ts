// Webhook Telegram-бота Mini GTD.
//
// Приймає POST від Telegram (Update-об'єкт) на кожне повідомлення
// боту й:
//   1. /start <код>     — прив'язує telegram_chat_id до user_id за
//                          одноразовим кодом зі сторінки «Інтеграції»
//                          (js/pages/integrations.js).
//   2. текст             — створює задачу в tasks (list = "inbox",
//                          title = сам текст).
//   3. голосове (voice)  — качає файл із Telegram, розпізнає через
//                          Whisper-сумісний API (WHISPER_API_BASE_URL,
//                          дефолт — Groq), тоді розшифровку віддає
//                          на аналіз тому самому Groq-чату, що й
//                          ai-assist/ (_shared/groqChat.ts): ШІ
//                          виділяє головну задачу (title) окремо від
//                          деталей (note), і підзадачі — як названі
//                          користувачем уснo, так і додані самим ШІ,
//                          якщо вони явно потрібні, але не прозвучали
//                          (analyzeVoiceTask нижче). Текстові
//                          повідомлення так не розбираються — лише
//                          голосові, де довге хаотичне надиктовування
//                          справді потребує структурування.
//   4. у відповідь бот пише "✅ Додано в Inbox: …" (+ підзадачі, якщо
//      ШІ їх визначив).
//   5. /report [період]  — той самий звіт, що й на сторінці
//                          «Історія» (js/pages/history.js): виконані
//                          й скасовані задачі (completed = true чи
//                          status = "cancelled" — видно одразу, не
//                          чекаючи нічного автоперенесення в list =
//                          "archive" о 22:30) за період: "сьогодні",
//                          "тиждень" — поточний, "минулий" —
//                          попередній тиждень (це й дефолт без
//                          аргументу — найчастіший запит), "місяць"
//                          — поточний, "весь" — без обмежень, чи
//                          довільний "ДД-ММ-РРРР ДД-ММ-РРРР". Плюс
//                          готові команди для меню бота (тицяєш, не
//                          набираєш текст) — /report_today,
//                          /report_week, /report_lastweek,
//                          /report_month, /report_all
//                          (COMMAND_TO_ARGS нижче — той самий
//                          parseReportRange() на обидва шляхи, той
//                          самий порядок, що й пресети на сторінці
//                          «Історія»). Саме меню (кнопка "/" у
//                          Telegram) реєструється окремо, один раз,
//                          через setMyCommands — docs/ARCHITECTURE.md.
//   6. /tasks             — той самий дайджест, що й ранкове
//                          нагадування (daily-reminder/, будні
//                          9:00), на вимогу в будь-який момент;
//                          виконані задачі й так не потрапляють у
//                          вибірку (completed = false), не треба
//                          окремо їх виключати. Побудова дайджесту —
//                          спільна з daily-reminder/ через
//                          _shared/dailyDigest.ts.
//
// Довірений сервер — service_role key (повний доступ в обхід RLS,
// бо на момент запиту немає Supabase-сесії користувача, лише
// telegram_chat_id) живе тільки в секретах цієї функції, ніде
// більше в проєкті (js/config.js — навпаки, там лише публічний
// ключ, дивись коментар там).
//
// Задеплоїти й налаштувати — див. docs/ARCHITECTURE.md, розділ
// «Telegram-інтеграція». Я (Claude) не маю доступу до Supabase CLI
// чи Telegram-акаунту користувача, тому deploy/secrets/webhook —
// ручні кроки, як і SQL-міграції.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGroqJSON } from "../_shared/groqChat.ts";
import { addDays, kyivDateOf, mondayOf, monthRange, todayInKyiv } from "../_shared/dateHelpers.ts";
import { buildDigestMessage, type DigestTask } from "../_shared/dailyDigest.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
// Той самий APP_URL, що й у daily-reminder/ — посилання внизу
// дайджесту команди /tasks.
const APP_URL = Deno.env.get("APP_URL") ?? "https://ephemeral-daffodil-8d52cc.netlify.app";
const WHISPER_API_KEY = Deno.env.get("WHISPER_API_KEY") ?? "";
// Дефолт — Groq: OpenAI-сумісний ендпоінт /audio/transcriptions,
// безкоштовний ліміт вистачає для особистого використання. Щоб
// перейти на OpenAI — задати WHISPER_API_BASE_URL=https://api.openai.com/v1
// і WHISPER_MODEL=whisper-1 в секретах функції, код міняти не треба.
const WHISPER_API_BASE_URL = Deno.env.get("WHISPER_API_BASE_URL") ?? "https://api.groq.com/openai/v1";
const WHISPER_MODEL = Deno.env.get("WHISPER_MODEL") ?? "whisper-large-v3";
// SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY НЕ задаються через
// `supabase secrets set` — Supabase сам підставляє їх у кожну Edge
// Function автоматично (разом із SUPABASE_ANON_KEY, тут не
// потрібним). Задавати їх вручну не можна й не треба.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Telegram обмежує повідомлення 4096 символами й мовчки відхиляє все,
// що довше — раніше тут завжди були короткі підтвердження, але
// /report (нижче) може перелічити чимало задач одразу.
const MAX_MESSAGE_LENGTH = 3800;

async function sendMessage(chatId: number, text: string) {
  const body = text.length > MAX_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_MESSAGE_LENGTH)}\n\n… список скорочено, повний — у застосунку.`
    : text;

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: body }),
  });
}

// Файл голосового качається від Telegram двома запитами (спершу
// file_path, тоді сам файл), потім віддається на транскрипцію.
async function transcribeVoice(fileId: string): Promise<string> {
  const fileInfoRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoRes.json();
  if (!fileInfo.ok) throw new Error("Telegram getFile: " + JSON.stringify(fileInfo));

  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`);
  const audioBlob = await fileRes.blob();

  const form = new FormData();
  form.append("file", audioBlob, "voice.ogg");
  form.append("model", WHISPER_MODEL);

  const whisperRes = await fetch(`${WHISPER_API_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHISPER_API_KEY}` },
    body: form,
  });

  if (!whisperRes.ok) {
    throw new Error(`Whisper API (${whisperRes.status}): ${await whisperRes.text()}`);
  }

  const result = await whisperRes.json();
  return (result.text ?? "").trim();
}

type VoiceBreakdown = { title: string; note: string; subtasks: string[] };

// Розшифровка голосового — часто довгий, хаотичний потік думки, а
// не готова назва задачі: ШІ виділяє з неї головну задачу (title),
// решту суттєвого, що не увійшло в title, лишає в note, і збирає
// підзадачі — і ті, що користувач назвав уголос, і ті, що явно
// потрібні для виконання головної задачі, навіть якщо він їх не
// проговорив (наприклад, для «замовити столик у ресторані на суботу»
// — «підтвердити бронювання за день» — якщо це логічно випливає з
// контексту). Не вигадує зайвого понад це.
async function analyzeVoiceTask(transcript: string): Promise<VoiceBreakdown> {
  const result = await callGroqJSON(
    "Ти — асистент планування задач у GTD-застосунку. Користувач " +
      "щойно надиктував голосове повідомлення — текст може бути " +
      "довгим і хаотичним. Визнач: 1) title — головна задача, " +
      "коротким чітким формулюванням; 2) note — додаткові деталі з " +
      "тексту, які не увійшли в title (порожній рядок, якщо таких " +
      "нема); 3) subtasks — підзадачі: включи ті, що користувач " +
      "явно назвав, і додай ті, які очевидно потрібні для виконання " +
      "головної задачі, навіть якщо він їх не проговорив — але лише " +
      "те, що логічно випливає з тексту, не вигадуй зайвого. Якщо " +
      "задача проста, в одну дію — поверни порожній список subtasks. " +
      "Усе українською. Відповідай ЛИШЕ JSON-об'єктом формату " +
      '{"title": "...", "note": "...", "subtasks": ["...", ...]}, ' +
      "без жодного іншого тексту.",
    `Розшифровка голосового повідомлення:\n"${transcript}"`
  );

  const title = typeof result.title === "string" ? result.title.trim() : "";
  const note = typeof result.note === "string" ? result.note.trim() : "";
  const subtasks = Array.isArray(result.subtasks)
    ? result.subtasks.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];

  if (!title) throw new Error("ШІ не визначив головну задачу.");

  return { title, note, subtasks: subtasks.slice(0, 8) };
}

async function findUserIdByChatId(chatId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_links")
    .select("user_id")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (error) throw error;
  return data?.user_id ?? null;
}

async function handleStart(chatId: number, code: string | undefined, from: Record<string, unknown>) {
  if (!code) {
    await sendMessage(
      chatId,
      "Привіт! Щоб прив'язати акаунт — відкрий сторінку «Інтеграції» в Mini GTD, натисни «Згенерувати код прив'язки» й перейди за посиланням (або встав код сюди командою /start <код>)."
    );
    return;
  }

  const { data, error } = await supabase
    .from("telegram_links")
    .select("user_id, link_code_expires_at")
    .eq("link_code", code)
    .maybeSingle();

  if (error) throw error;

  if (!data || !data.link_code_expires_at || new Date(data.link_code_expires_at as string) < new Date()) {
    await sendMessage(chatId, "Код недійсний або застарів. Згенеруй новий на сторінці «Інтеграції» в Mini GTD.");
    return;
  }

  const { error: updateError } = await supabase
    .from("telegram_links")
    .update({
      telegram_chat_id: chatId,
      telegram_username: (from.username as string) ?? null,
      telegram_first_name: (from.first_name as string) ?? null,
      linked_at: new Date().toISOString(),
      link_code: null,
      link_code_expires_at: null,
    })
    .eq("user_id", data.user_id as string);

  if (updateError) throw updateError;

  await sendMessage(chatId, "✅ Прив'язано! Тепер надсилай сюди текст або голосове повідомлення — додам задачу у «Вхідні». /tasks — список задач зараз, /report — звіт по «Історії».");
}

type ReportRange = { from: string | null; to: string | null; label: string };
// Користувач вводить дати як ДД-ММ-РРРР (звичний формат) — усередині
// все одно рахуємо рядками "YYYY-MM-DD" (todayInKyiv/mondayOf/
// monthRange з _shared/dateHelpers.ts і так їх повертають, зручно
// порівнювати лексикографічно), тож на вході конвертуємо назад.
const DATE_UA = /^(\d{2})-(\d{2})-(\d{4})$/;

function parseUADate(value: string): string | null {
  const match = DATE_UA.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function lastWeekRange(today: string): ReportRange {
  const from = addDays(mondayOf(today), -7);
  return { from, to: addDays(from, 6), label: "минулий тиждень" };
}

// Той самий набір періодів, що й пресети на сторінці «Історія»
// (history.js) — без аргументу (чи "минулий") за замовчуванням
// минулий тиждень, бо це найчастіший запит користувача. Викликається
// і з тексту після /report, і напряму з готових команд меню бота
// (/report_week тощо, COMMAND_TO_ARGS нижче) — той самий парсер для
// обох шляхів.
function parseReportRange(args: string[]): ReportRange {
  const today = todayInKyiv();

  if (args[0] === "сьогодні") {
    return { from: today, to: today, label: "сьогодні" };
  }
  if (args[0] === "тиждень") {
    const from = mondayOf(today);
    return { from, to: addDays(from, 6), label: "поточний тиждень" };
  }
  if (args[0] === "місяць") {
    const { from, to } = monthRange(today);
    return { from, to, label: "поточний місяць" };
  }
  if (args[0] === "весь") {
    return { from: null, to: null, label: "увесь час" };
  }
  if (args[0] === "минулий") {
    return lastWeekRange(today);
  }
  if (args[0] && args[1]) {
    const from = parseUADate(args[0]);
    const to = parseUADate(args[1]);
    if (from && to) return { from, to, label: `${args[0]} — ${args[1]}` };
  }

  // Без аргументу (чи невідомий аргумент) — минулий тиждень.
  return lastWeekRange(today);
}

// Готові команди меню бота (Telegram "/" зі списком, налаштованим
// через setMyCommands — docs/ARCHITECTURE.md) — тицяєш замість того,
// щоб набирати "/report тиждень" руками. Кожна лише підставляє той
// самий аргумент, що й текстова команда, — parseReportRange() один
// на всі шляхи.
const COMMAND_TO_ARGS: Record<string, string> = {
  "/report_today": "сьогодні",
  "/report_week": "тиждень",
  "/report_lastweek": "минулий",
  "/report_month": "місяць",
  "/report_all": "весь",
};

type ArchivedTask = {
  title: string;
  completed: boolean;
  status: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
};

// Той самий звіт, що й «Історія» в застосунку (js/pages/history.js)
// — filtered за completed_at/cancelled_at (не updated_at, який
// перезаписує вечірнє автоперенесення), лише текстом замість
// інтерактивного списку. completed = true АБО status = "cancelled"
// АБО list = "archive" (не лише list = "archive"!) — задача,
// виконана сьогодні вдень, іще не встигла потрапити в list =
// "archive" (те саме нічне автоперенесення о 22:30), інакше "/report
// сьогодні" мовчки не показав би її аж до вечора (той самий баг, що
// був у getArchivedTasks() в js/store/taskStore.js, виправлено й тут).
async function handleReport(chatId: number, userId: string, argsText: string) {
  const range = parseReportRange(argsText.trim().split(/\s+/).filter(Boolean));

  const { data, error } = await supabase
    .from("tasks")
    .select("title, completed, status, completed_at, cancelled_at, updated_at")
    .eq("user_id", userId)
    .or("completed.eq.true,status.eq.cancelled,list.eq.archive")
    .is("deleted_at", null);

  if (error) {
    console.error(error);
    await sendMessage(chatId, "Не вдалося сформувати звіт. Спробуй ще раз.");
    return;
  }

  const tasks = (data ?? []) as ArchivedTask[];
  const filtered = tasks.filter((task) => {
    const at = kyivDateOf(task.completed_at || task.cancelled_at || task.updated_at);
    if (range.from && at < range.from) return false;
    if (range.to && at > range.to) return false;
    return true;
  });

  const done = filtered.filter((t) => t.completed);
  const cancelled = filtered.filter((t) => !t.completed && t.status === "cancelled");

  const listOf = (tasks: ArchivedTask[]) =>
    tasks.length > 0 ? tasks.map((t) => `• ${t.title}`).join("\n") : "Нічого нема.";

  await sendMessage(
    chatId,
    `📊 Звіт за ${range.label}:\n\n` +
      `✅ Виконано (${done.length}):\n${listOf(done)}\n\n` +
      `🚫 Скасовано (${cancelled.length}):\n${listOf(cancelled)}\n\n` +
      `Інші періоди: /report сьогодні · /report тиждень · /report минулий · /report місяць · /report весь · /report ДД-ММ-РРРР ДД-ММ-РРРР`
  );
}

// /tasks — той самий дайджест, що й ранкове нагадування
// (daily-reminder/), лише на вимогу, у будь-який момент — не тільки
// о 9:00 в будні. Задачі, які вже позначено виконаними, у вибірку
// (completed = false) і так не потрапляють — свіжий запит сам це
// враховує, спеціальної фільтрації "без виконаних" не треба.
async function handleTasks(chatId: number, userId: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, user_id, title, due_date, status, recurrence_window_days")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("completed", false)
    .in("list", ["inbox", "next"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    await sendMessage(chatId, "Не вдалося завантажити задачі. Спробуй ще раз.");
    return;
  }

  const tasks = (data ?? []) as DigestTask[];
  await sendMessage(chatId, buildDigestMessage(tasks, "📋 Задачі зараз:", APP_URL));
}

async function handleMessage(message: Record<string, unknown>) {
  const chat = message.chat as { id: number };
  const chatId = chat.id;
  const text = typeof message.text === "string" ? message.text.trim() : "";

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    await handleStart(chatId, code, (message.from as Record<string, unknown>) ?? {});
    return;
  }

  const userId = await findUserIdByChatId(chatId);
  if (!userId) {
    await sendMessage(chatId, "Спершу прив'яжи акаунт: сторінка «Інтеграції» в Mini GTD → «Згенерувати код прив'язки» → сюди командою /start <код>.");
    return;
  }

  if (text.startsWith("/report")) {
    const command = text.split(/\s+/)[0];
    const argsText = COMMAND_TO_ARGS[command] ?? text.slice(command.length);
    await handleReport(chatId, userId, argsText);
    return;
  }

  if (text === "/tasks") {
    await handleTasks(chatId, userId);
    return;
  }

  let title: string | null = null;
  let note = "";
  let subtasks: string[] = [];

  if (text) {
    title = text;
  } else if (message.voice) {
    const voice = message.voice as { file_id: string };
    let transcript: string;
    try {
      transcript = await transcribeVoice(voice.file_id);
    } catch (err) {
      console.error(err);
      await sendMessage(chatId, "Не вдалося розпізнати голосове повідомлення. Спробуй ще раз або надішли текстом.");
      return;
    }

    try {
      const breakdown = await analyzeVoiceTask(transcript);
      title = breakdown.title;
      note = breakdown.note;
      subtasks = breakdown.subtasks;
    } catch (err) {
      // ШІ-аналіз не вдався (наприклад, Groq тимчасово недоступний) —
      // не блокуємо користувача, зберігаємо розшифровку як є, без
      // розбиття на підзадачі.
      console.error(err);
      title = transcript;
    }
  }

  if (!title) {
    await sendMessage(chatId, "Надішли текст або голосове повідомлення — додам задачу у «Вхідні».");
    return;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({ user_id: userId, title, note, list: "inbox" })
    .select("id")
    .single();

  if (error || !task) {
    console.error(error);
    await sendMessage(chatId, "Не вдалося зберегти задачу. Спробуй ще раз.");
    return;
  }

  if (subtasks.length > 0) {
    const { error: subtaskError } = await supabase
      .from("subtasks")
      .insert(subtasks.map((subtaskTitle) => ({ task_id: task.id, user_id: userId, title: subtaskTitle })));
    // Задача вже збережена — невдале збереження підзадач не має
    // ховати сам факт, що задачу додано, лише логуємось.
    if (subtaskError) console.error(subtaskError);
  }

  const subtasksText = subtasks.length > 0 ? `\n📋 Підзадачі:\n${subtasks.map((s) => `• ${s}`).join("\n")}` : "";
  await sendMessage(chatId, `✅ Додано в Inbox: ${title}${subtasksText}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok");
  }

  // Telegram надсилає точно той secret_token, що вказали при
  // реєстрації webhook (setWebhook) — без цієї перевірки будь-хто,
  // хто дізнається URL функції, міг би створювати задачі від чужого
  // імені.
  if (TELEGRAM_WEBHOOK_SECRET) {
    const incoming = req.headers.get("x-telegram-bot-api-secret-token");
    if (incoming !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) {
    return new Response("ok");
  }

  try {
    await handleMessage(message);
  } catch (err) {
    console.error(err);
  }

  // Telegram завжди чекає 200 — інакше вважає доставку невдалою й
  // повторює той самий Update знову.
  return new Response("ok");
});
