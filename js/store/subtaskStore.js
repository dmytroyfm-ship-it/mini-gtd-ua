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
// @property {number} position
// @property {string} created_at

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

// Порядок — за position (кнопки «↑»/«↓» у рядку підзадачі), а
// created_at лишається тай-брейком для рядків з однаковою позицією
// (напр. кілька щойно доданих до того, як позиції перерахувались).
export async function getSubtasks(taskId) {
  const { data, error } = await supabase
    .from("subtasks")
    .select("*")
    .eq("task_id", taskId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

// Підзадачі одразу для кількох задач — один запит замість N.
// Використовує «Історія» (/history): під кожним рядком показує, які
// підзадачі виконані, а які ні. Повертає Map task_id → Subtask[], у
// кожній групі порядок за position (як і в getSubtasks()); задачі
// без підзадач у Map просто відсутні.
export async function getSubtasksByTaskIds(taskIds) {
  if (!taskIds || taskIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("subtasks")
    .select("*")
    .in("task_id", taskIds)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const byTask = new Map();
  for (const subtask of data) {
    const group = byTask.get(subtask.task_id) ?? [];
    group.push(subtask);
    byTask.set(subtask.task_id, group);
  }
  return byTask;
}

export async function addSubtask(taskId, title) {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  // Нова підзадача — в кінець списку: беремо найбільшу наявну
  // позицію й додаємо 1 (окремий короткий запит — простіше за
  // тригер/RPC, обсяг на задачу невеликий).
  const { data: last } = await supabase
    .from("subtasks")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("subtasks")
    .insert({
      task_id: taskId,
      user_id: session.id,
      title: title.trim(),
      position: (last?.position ?? -1) + 1,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Редагування назви підзадачі (SubtaskItem.js, кнопка «✎»).
export async function setSubtaskTitle(id, title) {
  const { error } = await supabase.from("subtasks").update({ title: title.trim() }).eq("id", id);

  if (error) throw error;
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

// Новий порядок підзадач — масив id у бажаному порядку. Пише кожній
// підзадачі її position = індекс у масиві (окремі UPDATE, паралельно
// — для кількох кроків на задачу дешевше, ніж RPC/тригер). Кидає,
// якщо хоч один UPDATE не вдався — виклик сам вирішує, що показати
// (SubtaskList → перечитати список).
export async function setSubtaskPositions(orderedIds) {
  const ids = orderedIds.filter((id) => !String(id).startsWith("temp-"));

  const results = await Promise.all(
    ids.map((id, index) => supabase.from("subtasks").update({ position: index }).eq("id", id)),
  );

  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;
}
