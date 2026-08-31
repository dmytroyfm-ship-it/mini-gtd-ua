// Автоматичний збір постів для «Стрічки» (/functions/v1/feed-poll).
//
// Раніше єдиним шляхом даних у feed_items був ручний виклик
// feed-webhook зовнішнім парсером (Apify/Firecrawl тощо, платно) —
// ця функція закриває більшість платформ: сама, за розкладом
// (pg_cron, див. supabase/migrations/20260831000000_setup_feed_poll_cron.sql),
// читає всі sources. Для YouTube/RSS будує URL фіда й розбирає
// XML (_shared/feedParse.ts, resolveFeedUrl+parseFeed); для Telegram —
// окрема HTML-функція (fetchTelegramEntries, t.me/s/... — офіційний
// веб-перегляд каналу, без бота й без стороннього RSS-мосту, той
// свій публічний інстанс тепер за Cloudflare-захистом); для
// Instagram — виклик платного Apify-актора (fetchInstagramEntries,
// потребує секрет APIFY_API_TOKEN, docs/ARCHITECTURE.md), рідше за
// решту (раз на 2 год, не щогодини — контроль вартості). Нові пости
// пересилаються в feed-webhook — той самий шлях (переклад/дедуп/
// валідація url), що й для будь-якого іншого джерела вебхука, лише
// feed-poll сам відіграє роль «парсера».
//
// Threads/Reddit/Twitter — без безкоштовного RSS і без підключеного
// Apify-актора, тут не підтримані (resolveFeedUrl поверне null,
// джерело буде пропущене й потрапить у "skipped"); ці платформи, як
// і раніше, можна наповнити вручну через feed-webhook.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveFeedUrl, parseFeed, fetchTelegramEntries, fetchInstagramEntries } from "../_shared/feedParse.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const FEED_WEBHOOK_SECRET = Deno.env.get("FEED_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Скільки останніх записів фіда розглядати за один прохід — дедуп
// (source_id, external_id) у feed-webhook усе одно відкине вже
// бачені, тож більший ліміт тут лише страхує перший запуск/довгу
// паузу, не створює дублікатів.
const ITEMS_PER_SOURCE = 8;

interface SourceRow {
  id: string;
  platform: string;
  handle: string;
}

Deno.serve(async (req) => {
  // Викликає лише pg_cron (та сама схема, що й daily-reminder) —
  // без секрету будь-хто зі знанням URL міг би змусити функцію
  // ходити на довільні джерела від імені проєкту.
  if (CRON_SECRET) {
    const incoming = req.headers.get("x-cron-secret");
    if (incoming !== CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
  }

  const { data: sources, error } = await supabase
    .from("sources")
    .select("id, platform, handle");

  if (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }

  const items: Record<string, unknown>[] = [];
  const skipped: string[] = [];

  // Instagram (Apify) — платний виклик ($0.0027/пост), на відміну
  // від решти платформ (безкоштовні). Раз щогодини сканував би той
  // самий профіль і майже завжди повертав ті самі останні пости
  // (люди постять не щогодини) — дедуп у feed-webhook відкинув би їх
  // як дублікати, але Apify вже взяв би гроші за сам факт скрапінгу.
  // Тому Instagram перевіряємо лише раз на 2 години (парні UTC-години)
  // — той самий pg_cron-виклик щогодини, просто половина проходів
  // пропускає цю платформу.
  const pollInstagramNow = new Date().getUTCHours() % 2 === 0;

  for (const source of (sources ?? []) as SourceRow[]) {
    // Telegram — не XML-фід, а HTML-сторінка (t.me/s/...), тому своя
    // функція (фетч+парсинг разом), не resolveFeedUrl()+parseFeed().
    if (source.platform === "telegram") {
      const entries = await fetchTelegramEntries(source.handle, ITEMS_PER_SOURCE);
      if (entries.length === 0) {
        skipped.push(`${source.platform}:${source.handle}`);
        continue;
      }
      for (const entry of entries) items.push({ source_id: source.id, ...entry });
      continue;
    }

    if (source.platform === "instagram") {
      if (!pollInstagramNow) {
        skipped.push(`${source.platform}:${source.handle} (наступна перевірка за розкладом раз на 2 год)`);
        continue;
      }
      const entries = await fetchInstagramEntries(source.handle, 5);
      if (entries.length === 0) {
        skipped.push(`${source.platform}:${source.handle}`);
        continue;
      }
      for (const entry of entries) items.push({ source_id: source.id, ...entry });
      continue;
    }

    const feedUrl = await resolveFeedUrl(source.platform, source.handle);
    if (!feedUrl) {
      skipped.push(`${source.platform}:${source.handle}`);
      continue;
    }

    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MiniGTDFeedPoll/1.0)" },
      });
      if (!res.ok) {
        console.error("Фід недоступний:", feedUrl, res.status);
        continue;
      }
      const xml = await res.text();
      for (const entry of parseFeed(xml, ITEMS_PER_SOURCE)) {
        items.push({ source_id: source.id, ...entry });
      }
    } catch (err) {
      console.error("Не вдалося прочитати фід:", feedUrl, err);
    }
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ ok: true, forwarded: 0, skipped }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Пересилаємо тим самим шляхом, що й зовнішній парсер — жодного
  // дублювання перекладу/валідації/дедупу тут, усе це вже є в
  // feed-webhook.
  const webhookRes = await fetch(`${SUPABASE_URL}/functions/v1/feed-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-feed-webhook-secret": FEED_WEBHOOK_SECRET },
    body: JSON.stringify({ items }),
  });
  const webhookResult = await webhookRes.json().catch(() => null);

  return new Response(JSON.stringify({ ok: true, forwarded: items.length, skipped, webhookResult }), {
    headers: { "Content-Type": "application/json" },
  });
});
