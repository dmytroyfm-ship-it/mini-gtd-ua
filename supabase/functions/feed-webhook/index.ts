// Webhook для сторінки «Стрічка» (/feed).
//
// Приймає POST від зовнішнього парсера (Apify/Firecrawl тощо) —
// один пост (об'єкт) або декілька одразу (масив чи { items: [...] }),
// перекладає заголовок/текст на українську через Groq (якщо вже
// українською — Groq повертає без змін) і зберігає в feed_items.
//
// Як і telegram-webhook/daily-reminder — не Supabase-сесія, а
// власний секрет FEED_WEBHOOK_SECRET (заголовок
// x-feed-webhook-secret або ?secret=... в URL — деякі no-code
// інструменти зручніше налаштовують через query, ніж кастомні
// заголовки), тому verify_jwt = false (config.toml).
//
// Очікуваний формат одного елемента:
//   {
//     "source_id": "uuid — з таблиці sources, дивись на /sources",
//     "external_id": "опційно, для дедупу (id відео/твіту/посту)",
//     "author": "опційно",
//     "title": "обов'язково",
//     "text": "опційно",
//     "url": "обов'язково",
//     "published_at": "опційно, ISO-дата"
//   }
// user_id визначається сам, за source_id (щоб зовнішній парсер не
// мусив і не міг його вгадувати).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGroqJSON } from "../_shared/groqChat.ts";

const FEED_WEBHOOK_SECRET = Deno.env.get("FEED_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface IncomingItem {
  source_id?: string;
  external_id?: string;
  author?: string;
  title?: string;
  text?: string;
  url?: string;
  published_at?: string;
}

interface IngestResult {
  ok: boolean;
  reason?: string;
}

async function translate(title: string, text: string): Promise<{ titleUk: string; textUk: string }> {
  try {
    const result = await callGroqJSON(
      "Ти — перекладач у новинній стрічці. Якщо наведені заголовок і " +
        "текст НЕ українською — перекладай на українську, зберігаючи " +
        "зміст і тон, нічого не додаючи від себе. Якщо вони вже " +
        'українською — поверни без змін. Відповідай ЛИШЕ JSON-об\'єктом ' +
        '{"title": "...", "text": "..."}, без жодного іншого тексту.',
      `Заголовок: ${JSON.stringify(title)}\nТекст: ${JSON.stringify(text)}`
    );

    return {
      titleUk: typeof result.title === "string" && result.title.trim() ? result.title.trim() : title,
      textUk: typeof result.text === "string" ? result.text.trim() : text,
    };
  } catch (err) {
    // Переклад — не критична частина: якщо Groq зараз недоступний,
    // краще зберегти пост оригіналом, ніж не зберегти взагалі.
    console.error("Переклад не вдався, лишаю оригінал:", err);
    return { titleUk: title, textUk: text };
  }
}

async function ingestItem(item: IncomingItem): Promise<IngestResult> {
  if (!item.source_id || !item.title || !item.url) {
    return { ok: false, reason: "Обов'язкові поля: source_id, title, url." };
  }

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("user_id")
    .eq("id", item.source_id)
    .maybeSingle();

  if (sourceError) return { ok: false, reason: sourceError.message };
  if (!source) return { ok: false, reason: `Джерело ${item.source_id} не знайдено.` };

  const { titleUk, textUk } = await translate(item.title, item.text ?? "");

  const { error: insertError } = await supabase.from("feed_items").insert({
    user_id: source.user_id,
    source_id: item.source_id,
    external_id: item.external_id ?? null,
    author: item.author ?? null,
    title: item.title,
    text: item.text ?? null,
    title_uk: titleUk,
    text_uk: textUk,
    url: item.url,
    published_at: item.published_at ?? null,
  });

  if (insertError) {
    // 23505 — унікальний індекс (source_id, external_id): парсер
    // уже присилав цей самий пост раніше, це не помилка.
    if (insertError.code === "23505") return { ok: true, reason: "duplicate, skipped" };
    return { ok: false, reason: insertError.message };
  }

  return { ok: true };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-feed-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Метод не підтримується." }, 405);
  }

  if (FEED_WEBHOOK_SECRET) {
    const url = new URL(req.url);
    const incoming = req.headers.get("x-feed-webhook-secret") || url.searchParams.get("secret");
    if (incoming !== FEED_WEBHOOK_SECRET) {
      return json({ error: "forbidden" }, 403);
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Некоректний JSON." }, 400);
  }

  const items: IncomingItem[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown })?.items)
      ? ((body as { items: IncomingItem[] }).items)
      : [body as IncomingItem];

  const results: IngestResult[] = [];
  for (const item of items) {
    results.push(await ingestItem(item));
  }

  const saved = results.filter((r) => r.ok).length;
  return json({ received: items.length, saved, results });
});
