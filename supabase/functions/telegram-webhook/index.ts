// Webhook Telegram-бота Mini GTD UA.
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

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
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

async function sendMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
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
      "Привіт! Щоб прив'язати акаунт — відкрий сторінку «Інтеграції» в Mini GTD UA, натисни «Згенерувати код прив'язки» й перейди за посиланням (або встав код сюди командою /start <код>)."
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
    await sendMessage(chatId, "Код недійсний або застарів. Згенеруй новий на сторінці «Інтеграції» в Mini GTD UA.");
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

  await sendMessage(chatId, "✅ Прив'язано! Тепер надсилай сюди текст або голосове повідомлення — додам задачу у «Вхідні».");
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
    await sendMessage(chatId, "Спершу прив'яжи акаунт: сторінка «Інтеграції» в Mini GTD UA → «Згенерувати код прив'язки» → сюди командою /start <код>.");
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
