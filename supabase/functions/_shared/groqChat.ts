// Спільний виклик Groq chat completions (JSON-режим) — і для
// ai-assist/ (розбити на кроки / що зробити зараз), і для
// feed-webhook/ (переклад постів стрічки). Той самий ключ
// WHISPER_API_KEY, що вже налаштований для розпізнавання голосу в
// telegram-webhook/ (один Groq-акаунт, один ключ на будь-який їхній
// ендпоінт) — нового секрету заводити не треба.

const GROQ_API_KEY = Deno.env.get("WHISPER_API_KEY") ?? "";
const GROQ_API_BASE_URL = Deno.env.get("WHISPER_API_BASE_URL") ?? "https://api.groq.com/openai/v1";
// Groq регулярно знімає з підтримки старі моделі (так і сталось із
// llama-3.3-70b-versatile за кілька годин після першого деплою) —
// якщо ця теж колись зникне, досить задати свій секрет AI_MODEL,
// код міняти не треба.
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "openai/gpt-oss-120b";

export async function callGroqJSON(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GROQ_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq не повернув відповіді.");

  return JSON.parse(content);
}
