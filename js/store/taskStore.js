// Сховище задач через Supabase (Postgres + RLS) — реальні дані.
//
// RLS сам фільтрує кожен запит за user_id (див.
// supabase/migrations/20260824000000_create_tasks_table.sql) — тут
// це вручну не вказується (і не потрібно: без чинної сесії будь-
// який запит просто поверне порожній результат чи помилку доступу,
// ніхто не побачить чужих задач). Для INSERT user_id все ж треба
// передати явно — цього вимагає політика RLS "with check".
//
// @typedef {Object} Task
// @property {string} id
// @property {string} user_id
// @property {string} title
// @property {string} note
// @property {"inbox"|"next"|"read_watch"|"someday"|"archive"} list
// @property {string[]} tags
// @property {boolean} completed
// @property {"urgent"|"not_urgent"|"daily"|"cancelled"|"waiting"} status
// @property {string|null} due_date
// @property {string|null} deleted_at
// @property {string} created_at
// @property {string} updated_at

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

// Найновіші — зверху.
export async function getTasks(list) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("list", list)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Усі активні задачі користувача, незалежно від list — для дошки
// (/board), яка сама розкладає їх по колонках за status/completed.
export async function getAllTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// values: { title: string, note?: string }
export async function addTask(values) {
  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: session.id,
      title: values.title.trim(),
      note: (values.note || "").trim(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setTaskCompleted(id, completed) {
  const { error } = await supabase.from("tasks").update({ completed }).eq("id", id);

  if (error) throw error;
}

// Статус — той самий dropdown у картці задачі й ті самі колонки
// дошки /board (drag-and-drop туди теж викликає цю функцію) —
// єдине поле, єдине джерело правди для обох місць.
export async function setTaskStatus(id, status) {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);

  if (error) throw error;
}

// Зміна списку (dropdown у картці задачі) — та сама колонка list,
// що визначає, у якому зі списків («Вхідні», «Задачі» тощо) задача
// зʼявляється; getTasks(list) фільтрує саме за нею.
export async function setTaskList(id, list) {
  const { error } = await supabase.from("tasks").update({ list }).eq("id", id);

  if (error) throw error;
}

// dueDate: "YYYY-MM-DD" або null, щоб прибрати дедлайн.
export async function setTaskDueDate(id, dueDate) {
  const { error } = await supabase.from("tasks").update({ due_date: dueDate }).eq("id", id);

  if (error) throw error;
}

// tags — повний новий масив (картка сама рахує [...task.tags, новий]).
export async function setTaskTags(id, tags) {
  const { error } = await supabase.from("tasks").update({ tags }).eq("id", id);

  if (error) throw error;
}

// М'яке видалення — задача просто позначається видаленою
// (deleted_at), її рядок у базі не стирається.
export async function moveTaskToTrash(id) {
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

// Кошик: задачі з непорожнім deleted_at. Найновіше видалені —
// зверху.
export async function getTrashedTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Відновлення — просто очищає deleted_at. Список (`list`) у задачі
// ніколи не змінювався при видаленні, тож вона сама повертається
// туди, де була (inbox / next / тощо).
export async function restoreTask(id) {
  const { error } = await supabase.from("tasks").update({ deleted_at: null }).eq("id", id);

  if (error) throw error;
}

// Остаточне видалення — реальний DELETE, рядок зникає з бази.
export async function deleteTaskPermanently(id) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) throw error;
}
