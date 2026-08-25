// Сховище стрічки (сторінка «Стрічка», /feed). Записи вставляє лише
// supabase/functions/feed-webhook/ (service_role, в обхід RLS) —
// звідси лише читання й зміна статусу (RLS: auth.uid() = user_id,
// той самий принцип, що й скрізь).
//
// @typedef {Object} FeedItem
// @property {string} id
// @property {string} source_id
// @property {string|null} external_id
// @property {string|null} author
// @property {string} title
// @property {string|null} text
// @property {string|null} title_uk
// @property {string|null} text_uk
// @property {string} url
// @property {string|null} published_at
// @property {"new"|"skipped"|"added"} status
// @property {{platform: string, handle: string}} [sources]

import { supabase } from "../lib/supabaseClient.js";

// sources(platform, handle) — вбудований запит через FK, потрібен
// для заголовка картки («Джерело · @автор · дата»).
export async function getFeedItems() {
  const { data, error } = await supabase
    .from("feed_items")
    .select("*, sources(platform, handle)")
    .eq("status", "new")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function skipFeedItem(id) {
  const { error } = await supabase.from("feed_items").update({ status: "skipped" }).eq("id", id);
  if (error) throw error;
}

export async function markFeedItemAdded(id) {
  const { error } = await supabase.from("feed_items").update({ status: "added" }).eq("id", id);
  if (error) throw error;
}
