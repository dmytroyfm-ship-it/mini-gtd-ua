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
// @property {"daily"|"weekly"|"monthly"|null} recurrence
// @property {number|null} recurrence_window_days — довжина періоду
//   дедлайну (в днях) ДО due_date; null — точно один фіксований
//   день, як і раніше. Має сенс лише для weekly/monthly.
// @property {string|null} deleted_at
// @property {string} created_at
// @property {string} updated_at

import { supabase } from "../lib/supabaseClient.js";
import { getSession } from "./authStore.js";

// Одна задача за id — для сторінки детального перегляду (/task/:id).
export async function getTaskById(id) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) throw error;
  return data;
}

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

// values: { title: string, note?: string } — редагування назви й
// нотатки (TaskCard.js, кнопка «✎»).
export async function updateTask(id, values) {
  const { error } = await supabase
    .from("tasks")
    .update({ title: values.title.trim(), note: (values.note || "").trim() })
    .eq("id", id);

  if (error) throw error;
}

export async function setTaskCompleted(id, completed) {
  const { error } = await supabase.from("tasks").update({ completed }).eq("id", id);

  if (error) throw error;
}

// recurrence: "daily" | "weekly" | "monthly" | null.
export async function setTaskRecurrence(id, recurrence) {
  const { error } = await supabase.from("tasks").update({ recurrence }).eq("id", id);

  if (error) throw error;
}

// windowDays: number | null — довжина періоду дедлайну в днях ДО
// due_date (наприклад, дедлайн 10-те + windowDays: 9 = період
// «з 1 по 10»); null прибирає період, лишає точно один фіксований
// день (TaskCard.js, поле «Початок періоду»).
export async function setTaskRecurrenceWindow(id, windowDays) {
  const { error } = await supabase.from("tasks").update({ recurrence_window_days: windowDays }).eq("id", id);

  if (error) throw error;
}

function nextDueDate(dueDate, recurrence) {
  // Немає дедлайну — рахуємо від сьогодні (немає іншої точки
  // відліку для наступного повторення).
  const base = dueDate ? new Date(`${dueDate}T00:00:00`) : new Date();

  if (recurrence === "monthly") {
    // base.setMonth(base.getMonth() + 1) напряму тут не годиться:
    // 31 січня так стає 3 березня (лютого 31-го не існує, JS сам
    // переносить надлишок на наступний місяць) замість очікуваного
    // 28/29 лютого. Рахуємо явно: переходимо на перше число,
    // додаємо місяць, тоді ставимо той самий день, обрізаний до
    // довжини нового місяця.
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + 1);
    const lastDayOfMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(day, lastDayOfMonth));
  } else if (recurrence === "weekly") {
    base.setDate(base.getDate() + 7);
  } else {
    base.setDate(base.getDate() + 1);
  }

  return base.toISOString().slice(0, 10);
}

// Позначає задачу виконаною; якщо в неї задано recurrence — одразу
// створює нову задачу на наступну дату (та сама назва/нотатка/
// список/теги/статус/повторення), а цю лишає виконаною назавжди —
// зберігається історія повторень, замість одного рядка, який
// щоразу скидався б назад у невиконаний стан. Без recurrence —
// звичайне setTaskCompleted(), без нової задачі.
export async function completeTask(task) {
  await setTaskCompleted(task.id, true);

  if (!task.recurrence) return null;

  const session = getSession();
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: session.id,
      title: task.title,
      note: task.note || "",
      list: task.list,
      tags: task.tags || [],
      status: task.status,
      due_date: nextDueDate(task.due_date, task.recurrence),
      recurrence: task.recurrence,
      // Довжина періоду (в днях) — та сама, що й була; лише дедлайн
      // (кінець періоду) зсувається на наступний цикл вище.
      recurrence_window_days: task.recurrence_window_days ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
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
