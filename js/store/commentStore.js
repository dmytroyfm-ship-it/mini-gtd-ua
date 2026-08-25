// Сховище коментарів до задачі (сторінка /task/:id) — той самий
// підхід, що й materialStore.js/subtaskStore.js.
//
// @typedef {Object} Comment
// @property {string} id
// @property {string} task_id
// @property {string} user_id
// @property {string} text
// @property {string} created_at

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

export async function getComments(taskId) {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addComment(taskId, text) {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { data, error } = await supabase
    .from("comments")
    .insert({ task_id: taskId, user_id: session.id, text: text.trim() })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw error;
}
