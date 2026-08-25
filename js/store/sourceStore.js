// Сховище джерел (сторінка «Джерела», /sources) — звичайний RLS-
// захищений CRUD, той самий підхід, що й taskStore.js.
//
// @typedef {Object} Source
// @property {string} id
// @property {string} user_id
// @property {"youtube"|"telegram"|"instagram"|"threads"|"reddit"|"twitter"|"rss"} platform
// @property {string} handle
// @property {string} created_at

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

export async function getSources() {
  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// values: { platform: string, handle: string }
export async function addSource(values) {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { data, error } = await supabase
    .from("sources")
    .insert({ user_id: session.id, platform: values.platform, handle: values.handle })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSource(id) {
  const { error } = await supabase.from("sources").delete().eq("id", id);
  if (error) throw error;
}
