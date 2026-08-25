// Сховище прив'язки Telegram (js/pages/integrations.js) — читає й
// пише лише власний рядок у telegram_links через звичайний клієнт
// (RLS: auth.uid() = user_id, як і всюди в проєкті). Саму прив'язку
// (заповнення telegram_chat_id) робить не цей код, а Edge Function
// supabase/functions/telegram-webhook/ — вона бачить чужий user_id
// лише в обхід RLS через service_role key, довірений сервер, якого
// раніше в проєкті не було.
//
// @typedef {Object} TelegramLink
// @property {string} user_id
// @property {number|null} telegram_chat_id
// @property {string|null} link_code
// @property {string|null} link_code_expires_at
// @property {string|null} linked_at

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // без 0/O/1/I — важко переплутати
const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 15;

function generateCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function getTelegramLink() {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("user_id", session.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Створює (чи перезаписує) код прив'язки для поточного користувача.
// Не займає telegram_chat_id — якщо він уже був, лишається як є, доки
// Edge Function не заповнить його заново після нового /start.
export async function generateLinkCode() {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("telegram_links")
    .upsert(
      { user_id: session.id, link_code: code, link_code_expires_at: expiresAt },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unlinkTelegram() {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { error } = await supabase
    .from("telegram_links")
    .update({ telegram_chat_id: null, linked_at: null, link_code: null, link_code_expires_at: null })
    .eq("user_id", session.id);

  if (error) throw error;
}
