// Сховище матеріалів (посилання/файли, прикріплені до задачі) —
// той самий принцип, що й taskStore.js/subtaskStore.js: RLS
// фільтрує кожен запит за user_id (див.
// supabase/migrations/20260824010000_create_subtasks_and_materials_tables.sql).
//
// @typedef {Object} Material
// @property {string} id
// @property {string} task_id
// @property {string} user_id
// @property {"link"|"file"|"onedrive"|"gdrive"} type
// @property {string} url
// @property {string} title
// @property {string} created_at

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

export async function getMaterials(taskId) {
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// values: { type: string, url: string, title: string }
export async function addMaterial(taskId, values) {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { data, error } = await supabase
    .from("materials")
    .insert({
      task_id: taskId,
      user_id: session.id,
      type: values.type,
      url: values.url,
      title: values.title,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMaterial(id) {
  const { error } = await supabase.from("materials").delete().eq("id", id);

  if (error) throw error;
}
