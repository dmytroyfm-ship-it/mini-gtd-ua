// Сховище підзадач (Next Actions) через Supabase — той самий
// принцип, що й taskStore.js: RLS фільтрує кожен запит за
// user_id (див.
// supabase/migrations/20260824010000_create_subtasks_and_materials_tables.sql),
// тут це вручну не вказується.
//
// @typedef {Object} Subtask
// @property {string} id
// @property {string} task_id
// @property {string} user_id
// @property {string} title
// @property {boolean} completed
// @property {string[]} tags
// @property {string|null} due_date
// @property {string} created_at

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

// dueDate: "YYYY-MM-DD" або null.
export async function setSubtaskDueDate(id, dueDate) {
  const { error } = await supabase.from("subtasks").update({ due_date: dueDate }).eq("id", id);

  if (error) throw error;
}

// tags — повний новий масив (компонент сам рахує [...subtask.tags, новий]).
export async function setSubtaskTags(id, tags) {
  const { error } = await supabase.from("subtasks").update({ tags }).eq("id", id);

  if (error) throw error;
}

export async function deleteSubtask(id) {
  const { error } = await supabase.from("subtasks").delete().eq("id", id);

  if (error) throw error;
}
