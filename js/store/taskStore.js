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
// @property {number|null} recurrence_anchor_day — "рідне" число
//   місяця для monthly-повторення (1-31), незалежне від фактичного
//   due_date (який могло обрізати через короткий місяць) — так
//   задача на 31-е після лютого сама повертається до 31-го в
//   березні, а не застрягає на 28-му назавжди.
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

// "31" в recurrence_anchor_day — спеціальне значення "завжди
// останній день місяця", а не буквально "31 число". Так задача, чий
// дедлайн збігається з останнім днем ЙОГО місяця (наприклад, 30-е у
// 30-денному місяці), у наступних місяцях сама переїжджає на
// справжній останній день (30/31/28/29) — а не залипає на "30"
// назавжди, навіть коли в новому місяці є 31-е. Дедлайн, що не є
// останнім днем свого місяця (наприклад, 30-е в 31-денному місяці),
// зберігається буквально — те саме число, обрізане лише якщо в
// якомусь місяці його справді нема (Math.min нижче, в nextDueDate).
function computeAnchorDay(dueDate) {
  const date = new Date(`${dueDate}T00:00:00`);
  const day = date.getDate();
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return day === lastDayOfMonth ? 31 : day;
}

// recurrence: "daily" | "weekly" | "monthly" | null. dueDate —
// поточний дедлайн задачі (task.due_date з картки); при переході на
// "monthly" з уже наявним дедлайном фіксує recurrence_anchor_day
// (computeAnchorDay вище) — "рідне" число, до якого monthly-
// повторення завжди повертається (див. nextDueDate нижче). Немає
// дедлайну ще — anchor просто не встановлюється зараз,
// setTaskDueDate() зробить це пізніше, коли дедлайн зʼявиться.
export async function setTaskRecurrence(id, recurrence, dueDate) {
  const values = { recurrence };
  if (recurrence === "monthly" && dueDate) {
    values.recurrence_anchor_day = computeAnchorDay(dueDate);
  }

  const { error } = await supabase.from("tasks").update(values).eq("id", id);

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

function nextDueDate(dueDate, recurrence, anchorDay) {
  // Немає дедлайну — рахуємо від сьогодні (немає іншої точки
  // відліку для наступного повторення).
  const base = dueDate ? new Date(`${dueDate}T00:00:00`) : new Date();

  if (recurrence === "monthly") {
    // "Рідне" число місяця — anchorDay (recurrence_anchor_day), не
    // день попереднього due_date: інакше задача на 31-е після
    // короткого місяця (due_date обрізався до 30-го) назавжди
    // застрягала б на 30-му, навіть у місяцях, де є 31-е — anchorDay
    // лишається незмінним (тим самим числом чи сентинелом "31" —
    // computeAnchorDay вище) незалежно від того, до чого обрізався
    // фактичний due_date минулого разу. Немає anchorDay (старі
    // задачі до цього поля) — використовуємо день due_date, як і
    // раніше.
    const day = anchorDay ?? base.getDate();
    // base.setMonth(base.getMonth() + 1) напряму тут не годиться:
    // 31 січня так стає 3 березня (лютого 31-го не існує, JS сам
    // переносить надлишок на наступний місяць) замість очікуваного
    // 28/29 лютого. Рахуємо явно: переходимо на перше число,
    // додаємо місяць, тоді ставимо потрібний день, обрізаний до
    // довжини нового місяця.
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
      due_date: nextDueDate(task.due_date, task.recurrence, task.recurrence_anchor_day),
      recurrence: task.recurrence,
      // Довжина періоду (в днях) — та сама, що й була; лише дедлайн
      // (кінець періоду) зсувається на наступний цикл вище.
      recurrence_window_days: task.recurrence_window_days ?? null,
      // "Рідне" число місяця (чи сентинел "завжди останній день") —
      // незмінне з циклу в цикл, саме воно й не дає new due_date
      // назавжди застрягти на обрізаному числі короткого місяця.
      recurrence_anchor_day: task.recurrence_anchor_day ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Пропустити цикл повторюваної задачі — коли самої події цього разу
// не було (наприклад, нараду скасували), і позначати виконаною
// нічого. На відміну від completeTask(): не чіпає completed, не
// створює нового рядка історії — просто переносить due_date цієї ж
// задачі на наступний цикл (та сама nextDueDate(), anchor і період
// лишаються, як були).
export async function skipTask(task) {
  if (!task.recurrence) throw new Error("Пропустити можна лише повторювану задачу.");

  const nextDue = nextDueDate(task.due_date, task.recurrence, task.recurrence_anchor_day);
  const { error } = await supabase.from("tasks").update({ due_date: nextDue }).eq("id", task.id);

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

// dueDate: "YYYY-MM-DD" або null, щоб прибрати дедлайн. Разом із
// самим дедлайном завжди оновлює й recurrence_anchor_day
// (computeAnchorDay вище) — байдуже, чи задача зараз monthly:
// значення просто лежить напоготові, якщо повторення стане "monthly"
// пізніше, і завжди відображає останню дату, яку користувач сам
// обрав руками (а не застарілий anchor від давно зміненого дедлайну).
export async function setTaskDueDate(id, dueDate) {
  const { error } = await supabase
    .from("tasks")
    .update({ due_date: dueDate, recurrence_anchor_day: dueDate ? computeAnchorDay(dueDate) : null })
    .eq("id", id);

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
