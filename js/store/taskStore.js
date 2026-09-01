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
// @property {string|null} completed_at — момент, коли completed
//   стало true (для звіту в «Історії»; на відміну від updated_at не
//   перезаписується пізнішим автоперенесенням у list "archive").
// @property {string|null} cancelled_at — те саме для моменту, коли
//   status став "cancelled".
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

// Чи вже настав період задачі (recurrence_window_days) — для дошки
// (/board), яка ховає задачі з періодом, поки він не почався: "1-10
// число" не мало б з'являтись на дошці вже 26-го попереднього місяця
// як просто "Повторювана", а рівно з 1-го — і лишається видимою й
// після завершення періоду, якщо не позначена виконаною (звичайна
// логіка для прострочених задач, тут нічого додатково не робимо).
// Саме == null, не falsy-перевірка: 0 — валідна довжина періоду
// (початок і дедлайн той самий день), а !0 помилково означало б
// "періоду нема" і показувало задачу на дошці зарано.
//
// Немає recurrence_window_days (null) і задача НЕ повторювана —
// завжди активна: звичайний фіксований дедлайн чи задача взагалі
// без дедлайну заздалегідь видно на дошці (щоб бачити майбутні
// дедлайни наперед, а не лише в сам день).
//
// Немає recurrence_window_days, але задача ПОВТОРЮВАНА —
// поводиться як period = 0 (старт = сам due_date), не "завжди
// активна": completeTask() одразу клонує нову задачу на наступний
// цикл (напр. "щодня" → завтра), і без цього правила вона миттю
// з'являлась би в тій самій колонці «Повторювані» вже сьогодні,
// одразу поруч із щойно виконаною — виглядало б, ніби залишилась
// ще одна копія на сьогодні, хоча насправді це вже завтрашня.
export function isWindowActive(task) {
  if (!task.due_date) return true;

  if (task.recurrence_window_days != null) {
    const start = new Date(`${task.due_date}T00:00:00`);
    start.setDate(start.getDate() - task.recurrence_window_days);
    return toLocalDateString(start) <= toLocalDateString(new Date());
  }

  if (!task.recurrence) return true;
  return task.due_date <= toLocalDateString(new Date());
}

// Задачі для дошки (/board), яка сама розкладає їх по колонках за
// status/completed. Лише list "next" («Задачі») — за прямим
// проханням користувача: дошка це вужчий фокус на тому, що вже
// розписано в роботу. «Вхідні» (ще не розібране), «Колись» (свідомо
// відкладене), «Читати/Дивитись» (матеріали) та «Історія» (вже
// закрите, автоперенесене о 22:30) на дошку не потрапляють. Тому ж
// підпорядкований і зворотний бік: перенос задачі в інший список
// (dropdown у картці) прибирає її з дошки на наступному
// refreshBoard() — окремої логіки для цього не треба.
export async function getAllTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("deleted_at", null)
    .eq("list", "next")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Пошук за словом (у назві чи нотатці) чи тегом — фільтрація на
// клієнті після одного запиту (для особистого використання обсяг не
// той, щоб виправдовувати складний ILIKE/OR-фільтр на PostgREST, і
// це заразом безпечніше — жодного ризику зламати фільтр спецсимволом
// у запиті). Шукає по всіх активних списках одразу, включно з
// «Історією» — «чи я робив це минулого місяця» теж корисний запит.
export async function searchTasks(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data.filter((task) => {
    if (task.title.toLowerCase().includes(q)) return true;
    if ((task.note || "").toLowerCase().includes(q)) return true;
    return (task.tags || []).some((tag) => tag.toLowerCase().includes(q));
  });
}

// Задачі статусу "В очікуванні" незалежно від їхнього list —
// показуються окремим розділом на сторінці «Колись» (someday.js),
// поруч зі списком someday, але не змішані з ним (окремий запит,
// а не фільтр по одному й тому самому масиву).
export async function getWaitingTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "waiting")
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

// completed_at ставиться/скидається разом із completed — окремий
// момент виконання для звіту в «Історії» (не updated_at, який
// пізніше перезапише автоперенесення в list "archive").
export async function setTaskCompleted(id, completed) {
  const { error } = await supabase
    .from("tasks")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) throw error;
}

// Date → "YYYY-MM-DD" за МІСЦЕВИМИ полями (getFullYear/getMonth/
// getDate), не toISOString() (той завжди повертає UTC): дати тут
// будуються як опівніч за МІСЦЕВИМ часом (new Date(`${...}T00:00:00`)
// без "Z" — так параситься за специфікацією), і toISOString() у
// таймзоні з позитивним зсувом (Київ, UTC+2/+3) відкочував би їх на
// день назад (опівніч 1 вересня за Києвом — це 31 серпня ~21:00 UTC;
// саме цей баг користувач і побачив у «Початку періоду»). Експортовано
// — TaskCardDueDate.js бере той самий фікс звідси, замість власної
// копії (знахідка код-рев'ю: обидва файли в тому самому графі
// ES-модулів, дублювати не було потреби).
export function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
//
// day >= 29, не просто day === lastDayOfMonth: 28 число ІСНУЄ в
// кожному місяці року, тож дедлайн 28 лютого (невисокосний рік) —
// це майже напевно буквально "28-ме", а не "останній день місяця"
// (типовий приклад — щомісячний платіж по 28-х); без цієї межі
// сентинел хибно спрацював би саме для 28 лютого, і березневий
// дедлайн переїжджав би на 31-е замість очікуваного 28-го (знахідка
// код-рев'ю). 29/30/31 — і далі сентинел, як і задумано вище.
function computeAnchorDay(dueDate) {
  const date = new Date(`${dueDate}T00:00:00`);
  const day = date.getDate();
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return day >= 29 && day === lastDayOfMonth ? 31 : day;
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
  } else if (recurrence !== "monthly") {
    // Анкер має сенс лише для monthly — переходячи на weekly/daily/
    // "не повторюється", лишається чистити старе значення (той самий
    // клас багу, що й з recurrence_window_days нижче).
    values.recurrence_anchor_day = null;
  }

  // Період («Початок періоду» → «Дедлайн») тепер доступний для
  // будь-якої задачі, не лише weekly/monthly (за проханням
  // користувача) — тож зміна повторення його НЕ чіпає: користувач
  // сам керує ним окремим полем (setTaskRecurrenceWindow), а
  // очищається він лише разом із самим дедлайном (setTaskDueDate
  // із dueDate = null).

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

  return toLocalDateString(base);
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
// єдине поле, єдине джерело правди для обох місць. cancelled_at —
// той самий принцип, що й completed_at вище: ставиться при переході
// на "cancelled", скидається при переході геть від нього.
export async function setTaskStatus(id, status) {
  const { error } = await supabase
    .from("tasks")
    .update({ status, cancelled_at: status === "cancelled" ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) throw error;
}

// Обробник dropdown «Статус» у картці задачі (TaskCard.js) — той
// самий один спільний шлях, що вже був лише в board.js
// (moveTaskToColumn(), для drag-and-drop і власного dropdown дошки):
// «Виконані» — не звичайне значення колонки status, а псевдо-опція
// "done", що веде через completeTask() (щоб повторювані задачі й
// далі коректно клонувались на наступний цикл, як і при галочці
// «виконано»); будь-яке інше значення — знімає completed і ставить
// звичайний статус, той самий шлях, що й раніше, — задача ніколи не
// лишається «застряглою» серед виконаних, коли статус змінили на
// щось інше. Потребує повний об'єкт задачі (не лише id) — саме через
// completeTask(), якому для клонування повторення потрібні title/
// note/list/tags/recurrence.
export async function changeTaskStatus(task, status) {
  if (status === "done") {
    await completeTask(task);
    return;
  }

  // Один запит замість двох послідовних (setTaskCompleted() +
  // setTaskStatus()) — те саме логічне «зняти виконано, поставити
  // статус» одним UPDATE (знахідка код-рев'ю: раніше кожна зміна
  // статусу з будь-якої з 6 сторінок платила подвійну затримку
  // мережі за один логічний запис).
  const { error } = await supabase
    .from("tasks")
    .update({
      completed: false,
      completed_at: null,
      status,
      cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
    })
    .eq("id", task.id);

  if (error) throw error;
}

// Обробник чекбокса «виконано» — той самий принцип, що й
// changeTaskStatus() вище (обидва обробляють одну реальну дію двома
// різними елементами керування картки): completed → completeTask()
// (повторювані задачі клонуються на наступний цикл), не completed →
// звичайне setTaskCompleted(false). Раніше це тіло було буквально
// скопійоване в 6 файлах сторінок (inbox.js/someday.js/taskDetail.js/
// listPage.js/search.js/board.js) — винесено сюди одним місцем
// (знахідка код-рев'ю), щоб майбутня зміна цієї поведінки (напр.
// новий побічний ефект при виконанні) не могла випадково лишитись
// застосованою лише в частині сторінок.
export async function toggleTaskCompleted(task, completed) {
  if (completed) await completeTask(task);
  else await setTaskCompleted(task.id, false);
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
// Прибираючи дедлайн (dueDate = null), заразом чистимо й період
// (recurrence_window_days) — «початок періоду» без кінця не має
// сенсу, і без цього старе значення тихо ожило б при новому дедлайні.
export async function setTaskDueDate(id, dueDate) {
  const values = {
    due_date: dueDate,
    recurrence_anchor_day: dueDate ? computeAnchorDay(dueDate) : null,
  };
  if (!dueDate) values.recurrence_window_days = null;

  const { error } = await supabase.from("tasks").update(values).eq("id", id);

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

// Історія (/history): виконані чи скасовані задачі — completed = true
// або status = "cancelled", НЕЗАЛЕЖНО від того, чи вже пройшло нічне
// автоперенесення в list = "archive" (pg_cron о 22:30, supabase/
// migrations/20260826030000_...). Раніше фільтрували лише за
// list = "archive" — щойно виконана вдень задача була б невидимою
// в «Історії» аж до вечора, поки не спрацює cron; тепер видно одразу
// (сам cron і далі потрібен — прибирає такі задачі з дошки/інших
// списків, «Історії» більше не стосується). list = "archive" у
// запиті лишається третьою умовою — старі записи, занесені сюди ще
// вручну до автоперенесення, самі по собі не completed/cancelled
// (HistoryItem.js показує їх нейтральною позначкою «📁 В архіві»).
// Сортування — updated_at (для звіту по датах сторінка сама читає
// completed_at/cancelled_at кожної задачі).
export async function getArchivedTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .or("completed.eq.true,status.eq.cancelled,list.eq.archive")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
}

// Повернення задачі з «Історії» назад у «Вхідні» (history.js, кнопка
// «Повернути у Вхідні» — доступна для всього, крім справді виконаних:
// скасовані задачі, і про всяк випадок — старі записи в архіві, що
// не є ні виконаними, ні скасованими). Статус скидається на
// дефолтний "not_urgent", інакше задача одразу знову виглядала б
// скасованою; cancelled_at очищається.
export async function restoreFromHistory(id) {
  const { error } = await supabase
    .from("tasks")
    .update({ list: "inbox", status: "not_urgent", cancelled_at: null })
    .eq("id", id);

  if (error) throw error;
}
