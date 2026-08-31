// RSS 2.0 / Atom — легкий регекс-парсер (без DOM/XML-бібліотеки:
// формат фідів достатньо передбачуваний, щоб не тягнути залежність
// заради цього) + резолв фід-URL для YouTube/Telegram/RSS-джерел
// (js/pages/sources.js, sources.platform/handle) — спільне для
// feed-poll/ (єдиний споживач наразі).

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
    .replace(/&apos;|&#39;/g, "'");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
      "";

    entries.push({
      external_id: extractTag(block, isAtom ? "id" : "guid") ?? url,
      title: stripTags(title),
      url: url.trim(),
      text: rawText ? stripTags(rawText).slice(0, 600) : null,
      author: extractTag(block, "author") ?? extractTag(block, "dc:creator") ?? null,
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
    const match = html.match(/"channelId":"(UC[0-9A-Za-z_-]{22})"/);
    return match ? match[1] : null;
  } catch (err) {
    console.error("Не вдалося визначити channelId YouTube для", handle, err);
    return null;
  }
}

// Telegram не має власного RSS — міст через публічний інстанс
// RSSHub (rsshub.app, безкоштовний, без реєстрації; за потреби
// власного/стабільнішого інстансу — замінити базовий URL тут).
function telegramFeedUrl(handle: string): string {
  const clean = handle.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  return `https://rsshub.app/telegram/channel/${clean}`;
}

/** Платформа + handle («Джерела», sources.platform/handle) → готовий
 * URL фіда, або null, якщо платформа не підтримує автопарсинг (немає
 * безкоштовного RSS — instagram/threads/reddit/twitter; ці джерела
 * лишаються доступні лише через ручний виклик feed-webhook, напр.
 * платним скрапером типу Apify). */
export async function resolveFeedUrl(platform: string, handle: string): Promise<string | null> {
  switch (platform) {
    case "rss":
      return /^https?:\/\//i.test(handle) ? handle.trim() : null;
    case "youtube": {
      const channelId = await resolveYoutubeChannelId(handle);
      return channelId ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` : null;
    }
    case "telegram":
      return telegramFeedUrl(handle);
    default:
      return null;
  }
}
