// Проксі до Groq LLM API для двох AI-фіч Mini GTD:
//   type: "breakdown"  — розбити задачу на кроки-підзадачі
//                        (js/components/TaskCard.js, кнопка
//                        «✨ Розбити на кроки»)
//   type: "next-task"  — обрати одну задачу зі списку «Задачі» для
//                        швидкої перемоги (js/pages/inbox.js,
//                        кнопка «✨ Що зробити зараз?»)
//
// На відміну від telegram-webhook/daily-reminder, цю функцію
// викликає лише сам застосунок від імені залогіненого користувача
// (supabase.functions.invoke() у js/store/aiStore.js сам додає
// Bearer-токен поточної сесії) — verify_jwt лишається дефолтним
// (true, немає запису в supabase/config.toml): Supabase перевіряє
// сесію ще до того, як код тут запуститься, нового секрету захисту
// не треба. Доступу до бази тут теж не треба — сама вставка
// підзадач/читання задач лишається на клієнті через звичайні RLS-
// захищені store (subtaskStore.js/taskStore.js), ця функція лише
// звертається до Groq і повертає відповідь.
//
// Ключ Groq і сам виклик chat completions — спільні з feed-webhook/
// (переклад постів стрічки), винесені в _shared/groqChat.ts.

import { callGroqJSON } from "../_shared/groqChat.ts";

async function handleBreakdown(title: unknown): Promise<string[]> {
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Порожня назва задачі.");
  }

  const result = await callGroqJSON(
    "Ти — асистент планування задач у GTD-застосунку. Розбий задачу " +
      "користувача на 3-5 простих, конкретних, виконуваних кроків " +
      "українською мовою. Відповідай ЛИШЕ JSON-об'єктом формату " +
      '{"steps": ["крок 1", "крок 2", ...]}, без жодного іншого тексту.',
    `Задача: "${title.trim()}"`
  );

  const steps = Array.isArray(result.steps)
    ? result.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];

  if (steps.length === 0) throw new Error("Не вдалося розпізнати кроки у відповіді ШІ.");

  return steps.slice(0, 8);
}

async function handleNextTask(tasks: unknown): Promise<{ taskId: string; reason: string }> {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error("Порожній список задач.");
  }

  const candidates = tasks.slice(0, 10) as Array<{ id: string; title: string }>;
  const list = candidates.map((t, i) => `${i + 1}. [${t.id}] ${t.title}`).join("\n");

  const result = await callGroqJSON(
    "Ти — асистент продуктивності в GTD-застосунку. З наведеного списку " +
      "задач вибери ОДНУ, яку варто зробити прямо зараз для швидкої " +
      "перемоги (найпростіша, найшвидша чи найважливіша — на твій " +
      "розсуд), і поясни чому — одне-два речення українською. Відповідай " +
      'ЛИШЕ JSON-об\'єктом формату {"task_id": "...", "reason": "..."}, ' +
      "де task_id — рівно один з ID зі списку, без жодного іншого тексту.",
    `Список задач:\n${list}`
  );

  const taskId = typeof result.task_id === "string" ? result.task_id : null;
  const reason = typeof result.reason === "string" ? result.reason.trim() : "";

  if (!taskId || !candidates.some((t) => t.id === taskId)) {
    throw new Error("ШІ повернув задачу поза списком.");
  }

  return { taskId, reason };
}

// На відміну від telegram-webhook/daily-reminder (їх викликає лише
// інший сервер), цю функцію викликає браузер напряму
// (supabase.functions.invoke() в aiStore.js) — без CORS-заголовків
// браузер сам блокує відповідь ще до нашого коду (preflight-запит
// OPTIONS взагалі лишається без відповіді), і клієнт бачить це як
// "зависло", без жодної явної помилки.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Метод не підтримується." });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некоректний запит." });
  }

  try {
    if (body.type === "breakdown") {
      return json({ steps: await handleBreakdown(body.title) });
    }

    if (body.type === "next-task") {
      return json(await handleNextTask(body.tasks));
    }

    return json({ error: "Невідомий тип запиту." });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Помилка ШІ." });
  }
});
