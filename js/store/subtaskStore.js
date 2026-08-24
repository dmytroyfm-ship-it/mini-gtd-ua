// Сховище підзадач (Next Actions) через Supabase — той самий
// принцип, що й taskStore.js: RLS фільтрує кожен запит за
// user_id (див.
// supabase/migrations/20260824010000_create_subtasks_and_materials_tables.sql),
// тут це вручну не вказується.

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

export async function getSubtasks(taskId) {
  const { data, error } = await supabase
    .from("subtasks")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addSubtask(taskId, title) {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { data, error } = await supabase
    .from("subtasks")
    .insert({
      task_id: taskId,
      user_id: session.id,
      title: title.trim(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setSubtaskCompleted(id, completed) {
  const { error } = await supabase.from("subtasks").update({ completed }).eq("id", id);

  if (error) throw error;
}

export async function deleteSubtask(id) {
  const { error } = await supabase.from("subtasks").delete().eq("id", id);

  if (error) throw error;
}
