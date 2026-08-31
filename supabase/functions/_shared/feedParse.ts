// RSS 2.0 / Atom — легкий регекс-парсер (без DOM/XML-бібліотеки:
// формат фідів достатньо передбачуваний, щоб не тягнути залежність
// заради цього) + резолв фід-URL для YouTube/RSS-джерел, окремий
// HTML-скрапер для Telegram і виклик платного Apify-актора для
// Instagram (js/pages/sources.js, sources.platform/handle) — спільне
// для feed-poll/ (єдиний споживач наразі).

export interface FeedEntry {
  external_id: string | null;
  title: string;
  url: string;
  text: string | null;
  author: string | null;
  published_at: string | null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    // Числові сутності (&#036; "$", &#x2019; "’" тощо) — Telegram
    // (t.me/s/...) рясно ними користується.
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Звичайний .slice(0, n) ріже по UTF-16 code unit — емодзі (Telegram
// рясно ними користується, 🔄🖥🏆 тощо) кодуються ДВОМА code units
// (сурогатна пара); обрізка точно посередині лишає в рядку самотній
// сурогат. Такий рядок далі ламає передачу як валідний UTF-8/JSON
// (живий тест 2026-08-31: один із 32 постів не зберігся, "Empty or
// invalid json"). Array.from() ділить по code points, не по code
// units — сурогатні пари лишаються цілими.
function safeTruncate(value: string, maxLength: number): string {
  const codePoints = Array.from(value);
  return codePoints.length <= maxLength ? value : codePoints.slice(0, maxLength).join("");
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeEntities(match[1]).trim() : null;
}

function extractAtomLink(block: string): string | null {
  const links = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  let fallback: string | null = null;
  for (const link of links) {
    const hrefMatch = link.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const relMatch = link.match(/rel=["']([^"']+)["']/i);
    if (!fallback) fallback = hrefMatch[1];
    if (!relMatch || relMatch[1] === "alternate") return hrefMatch[1];
  }
  return fallback;
}

function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Парсить RSS <item> чи Atom <entry> блоки в спільний формат
 * feed-webhook (той самий JSON, що очікує IncomingItem). */
export function parseFeed(xml: string, limit = 8): FeedEntry[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = isAtom
    ? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []
    : xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  const entries: FeedEntry[] = [];
  for (const block of blocks.slice(0, limit)) {
    const title = extractTag(block, "title");
    const url = isAtom ? extractAtomLink(block) : extractTag(block, "link");
    if (!title || !url) continue;

    const rawText =
      extractTag(block, "content:encoded") ??
      extractTag(block, "description") ??
      extractTag(block, "summary") ??
      extractTag(block, "content") ??
      // YouTube ховає опис відео не прямо в <entry>, а в
      // <media:group><media:description> — інші фіди цього тега не
      // мають, тож цей fallback безпечний і для них (просто null).
      extractTag(block, "media:description") ??
      "";

    // Atom <author> — не текст, а вкладена структура
    // (<author><name>...</name></author>); RSS <author>/<dc:creator> —
    // зазвичай простий текст. stripTags тут прибирає вкладені теги в
    // обох випадках, нічого не ламаючи для простого варіанту.
    const rawAuthor = extractTag(block, "author") ?? extractTag(block, "dc:creator") ?? null;

    entries.push({
      external_id: extractTag(block, isAtom ? "id" : "guid") ?? url,
      title: stripTags(title),
      url: url.trim(),
      text: rawText ? safeTruncate(stripTags(rawText), 600) : null,
      author: rawAuthor ? stripTags(rawAuthor) || null : null,
      published_at: toIsoDate(extractTag(block, "pubDate") ?? extractTag(block, "published") ?? extractTag(block, "updated")),
    });
  }
  return entries;
}

// YouTube: офіційний RSS існує лише за channel_id (UC..., 24 симв.) —
// @handle чи /c/... треба спершу перетворити, скануючи HTML сторінки
// каналу (без API-ключа й квоти YouTube Data API).
async function resolveYoutubeChannelId(handle: string): Promise<string | null> {
  const direct = handle.match(/UC[0-9A-Za-z_-]{22}/);
  if (direct) return direct[0];

  const clean = handle.trim().replace(/^@/, "");
  const pageUrl = /^https?:\/\//i.test(handle) ? handle : `https://www.youtube.com/@${clean}`;

  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MiniGTDFeedPoll/1.0)" } });
    if (!res.ok) return null;
    const html = await res.text();
    // Поле з channel_id мінялося в розмітці YouTube (перевірено живим
    // фетчем 2026-08-31): сторінка @handle більше не містить
    // "channelId", лише "externalId"/"browseId" чи canonical-посилання
    // — пробуємо всі варіанти по черзі, найнадійніший (canonical) першим.
    const patterns = [
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})"/,
      /"externalId":"(UC[0-9A-Za-z_-]{22})"/,
      /"browseId":"(UC[0-9A-Za-z_-]{22})"/,
      /"channelId":"(UC[0-9A-Za-z_-]{22})"/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return match[1];
    }
    return null;
  } catch (err) {
    console.error("Не вдалося визначити channelId YouTube для", handle, err);
    return null;
  }
}

/** Платформа + handle («Джерела», sources.platform/handle) → готовий
 * URL фіда, або null, якщо платформа не підтримує автопарсинг (немає
 * безкоштовного RSS — instagram/threads/reddit/twitter, а Telegram
 * має власну функцію нижче, fetchTelegramEntries: HTML не XML). Ці
 * непідтримані джерела лишаються доступні лише через ручний виклик
 * feed-webhook, напр. платним скрапером типу Apify). */
export async function resolveFeedUrl(platform: string, handle: string): Promise<string | null> {
  switch (platform) {
    case "rss":
      return /^https?:\/\//i.test(handle) ? handle.trim() : null;
    case "youtube": {
      const channelId = await resolveYoutubeChannelId(handle);
      return channelId ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` : null;
    }
    default:
      return null;
  }
}

// Telegram не має власного RSS. Публічний міст RSSHub (rsshub.app) —
// перший варіант, що напрошується, але живий тест (2026-08-31)
// показав: тепер стоїть за Cloudflare-захистом від ботів (403, "Just
// a moment..."), з Edge Function пройти неможливо в принципі. Замість
// нього — офіційний легкий веб-перегляд публічних каналів
// (t.me/s/<channel>, без бота й без стороннього мосту), розбираємо
// власну HTML-розмітку напряму (структура інша, ніж RSS/Atom, тому
// не через parseFeed()).
export async function fetchTelegramEntries(handle: string, limit = 8): Promise<FeedEntry[]> {
  const channel = handle.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  if (!channel) return [];

  try {
    const res = await fetch(`https://t.me/s/${channel}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MiniGTDFeedPoll/1.0)" },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const blocks = html.match(/<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|$)/g) ?? [];
    const entries: FeedEntry[] = [];

    for (const block of blocks) {
      const postMatch = block.match(/data-post="([^"]+)"/);
      if (!postMatch) continue;

      const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      const text = textMatch ? safeTruncate(stripTags(decodeEntities(textMatch[1])), 600) : null;
      // Медіа-пости без підпису (фото/відео без тексту) — пропускаємо:
      // немає природного заголовка, а порожня картка в стрічці лише
      // засмічує список.
      if (!text) continue;

      const dateMatch = block.match(/<time[^>]*datetime="([^"]+)"/);

      entries.push({
        external_id: postMatch[1],
        title: safeTruncate(text, 120) === text ? text : `${safeTruncate(text, 120)}…`,
        url: `https://t.me/${postMatch[1]}`,
        text,
        author: channel,
        published_at: toIsoDate(dateMatch ? dateMatch[1] : null),
      });
    }

    // t.me/s/ віддає повідомлення від старіших до новіших — беремо
    // останні `limit` і перевертаємо, щоб найновіші йшли першими.
    return entries.slice(-limit).reverse();
  } catch (err) {
    console.error("Не вдалося прочитати Telegram-канал", handle, err);
    return [];
  }
}

interface ApifyInstagramItem {
  url?: string;
  shortCode?: string;
  id?: string;
  caption?: string;
  timestamp?: string;
  ownerUsername?: string;
}

// Instagram не має безкоштовного RSS — на відміну від YouTube/RSS/
// Telegram, тут довелось платити: Apify (apify.com), актор
// apify/instagram-post-scraper, "run-sync-get-dataset-items" —
// стартує акторa й одразу повертає результат (без окремого
// опитування статусу запуску), саме те, що треба для виклику з
// pg_cron. APIFY_API_TOKEN — новий секрет, задає розробник
// (docs/ARCHITECTURE.md).
const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";
const APIFY_INSTAGRAM_ACTOR = "apify~instagram-post-scraper";

export async function fetchInstagramEntries(handle: string, limit = 5): Promise<FeedEntry[]> {
  if (!APIFY_API_TOKEN) return [];

  try {
    const res = await fetch(
      `https://api.apify.com/v2/actors/${APIFY_INSTAGRAM_ACTOR}/run-sync-get-dataset-items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${APIFY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: [handle.trim()],
          resultsLimit: limit,
        }),
      }
    );

    if (!res.ok) {
      console.error("Apify Instagram-актор відповів помилкою:", res.status, await res.text());
      return [];
    }

    const items = (await res.json()) as ApifyInstagramItem[];
    const entries: FeedEntry[] = [];

    for (const item of items) {
      if (!item.url || !item.caption) continue; // без підпису нема природного заголовка
      const text = safeTruncate(item.caption.trim(), 600);
      entries.push({
        external_id: item.shortCode ?? item.id ?? item.url,
        title: safeTruncate(text, 120) === text ? text : `${safeTruncate(text, 120)}…`,
        url: item.url,
        text,
        author: item.ownerUsername ?? null,
        published_at: toIsoDate(item.timestamp ?? null),
      });
    }
    return entries;
  } catch (err) {
    console.error("Не вдалося отримати пости Instagram через Apify для", handle, err);
    return [];
  }
}
