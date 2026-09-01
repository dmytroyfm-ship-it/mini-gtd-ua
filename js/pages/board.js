// Дошка Kanban (/board): задачі зі списку «Задачі» (list "next"
// лише — getAllTasks() так і фільтрує: «Вхідні»/«Колись»/«Читати/
// Дивитись»/«Історія» на дошку не потрапляють, це вужчий фокус на
// тому, що вже розписано в роботу), без видалених і без задач із
// періодом дедлайну, чий період ще не почався (isWindowActive()),
// розкладені по шести колонках статусів — усі одразу, без спойлера.
// Перетягування картки в іншу колонку одразу оновлює
// status (нативний HTML5 drag-and-drop — без бібліотек). Той самий
// status керується і dropdown «Статус» прямо в картці
// (TaskCard.js) — де завгодно змінили, синхронізовано скрізь, бо
// це одне й те саме поле в базі.
//
// Розподіл задачі по колонці — одне правило (bucketOf нижче), щоб
// кожна задача завжди належала рівно одній колонці:
//   1. completed === true            → «Виконані»
//   2. інакше status === "cancelled" → «Скасовані»
//   3. інакше status === "waiting"   → «В очікуванні»
//   4. інакше сам status ("urgent" / "daily" / "not_urgent" —
//      усе, що не підпадає під 1–3, тобто й дефолтне значення)

import {
  getAllTasks,
  isWindowActive,
  updateTask,
  setTaskStatus,
  setTaskCompleted,
  changeTaskStatus,
  toggleTaskCompleted,
  skipTask,
  moveTaskToTrash,
  setTaskList,
  setTaskDueDate,
  setTaskRecurrence,
  setTaskRecurrenceWindow,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskList } from "../components/TaskList.js";

const COLUMNS = [
  { key: "urgent", title: "Термінові" },
  { key: "not_urgent", title: "Не термінові" },
  { key: "daily", title: "Повторювані" },
  { key: "waiting", title: "В очікуванні" },
  { key: "done", title: "Виконані" },
  { key: "cancelled", title: "Скасовані" },
];

function bucketOf(task) {
  if (task.completed) return "done";
  if (task.status === "cancelled") return "cancelled";
  if (task.status === "waiting") return "waiting";
  if (task.status === "urgent") return "urgent";
  if (task.status === "daily") return "daily";
  return "not_urgent";
}

export async function renderBoard(root) {
  // Заголовок і сітка колонок — в одній обгортці (.board-page), яка
  // сама стягується до ширини сітки й центрується в межах
  // .page--wide (див. css/board.css). Без цього «Дошка» лишалась би
  // притиснутою до лівого краю широкої сторінки, тоді як сітка
  // колонок під нею — по центру: заголовок не збігався б із
  // «Термінові», як на решті вкладок.
  root.innerHTML = `
    <div class="board-page">
      <h1 class="page__title">Дошка</h1>
    </div>
  `;

  const boardPage = root.querySelector(".board-page");

  // Наповнюється в refreshBoard() — потрібен для changeTaskStatus() у
  // moveTaskToColumn() нижче (drag-and-drop знає лише taskId).
  let tasksById = new Map();

  const boardEl = document.createElement("div");
  boardEl.className = "board";
  boardPage.appendChild(boardEl);

  const cardHandlers = {
    onToggleCompleted: handleToggleCompleted,
    onDelete: handleDelete,
    onEditTask: handleEditTask,
    onStatusChange: handleStatusChange,
    onListChange: handleListChange,
    onDueDateChange: handleDueDateChange,
    onRecurrenceChange: handleRecurrenceChange,
    onRecurrenceWindowChange: handleRecurrenceWindowChange,
    onSkipTask: handleSkipTask,
    onAddTag: handleAddTag,
    draggable: true,
  };

  async function refreshBoard() {
    let tasks;

    try {
      tasks = await getAllTasks();
    } catch (err) {
      console.error(err);
      boardEl.innerHTML = "";
      const error = document.createElement("p");
      error.className = "page__text";
      error.textContent = "Не вдалося завантажити задачі. Спробуйте оновити сторінку.";
      boardEl.appendChild(error);
      return;
    }

    // Задача з періодом дедлайну (recurrence_window_days) на дошці
    // з'являється рівно з початку свого діапазону, не раніше — а не
    // висить у "Повторювані" весь час незалежно від дати. Звичайний
    // фіксований дедлайн (без періоду) чи задача взагалі без
    // дедлайну — не фільтрується, isWindowActive() для них завжди
    // true.
    tasks = tasks.filter(isWindowActive);

    // Перетягування (handleDrop) знає лише taskId, не повний
    // об'єкт — а changeTaskStatus()/completeTask() нижче потребують
    // саме його (title/note/list/tags/status/recurrence для нової
    // задачі, якщо повторювана).
    tasksById = new Map(tasks.map((task) => [task.id, task]));

    const buckets = { urgent: [], not_urgent: [], daily: [], done: [], cancelled: [], waiting: [] };
    tasks.forEach((task) => buckets[bucketOf(task)].push(task));

    renderColumns(buckets);
  }

  function renderColumns(buckets) {
    boardEl.innerHTML = "";

    COLUMNS.forEach((col) => {
      const columnEl = document.createElement("div");
      columnEl.className = "board-column";

      const header = document.createElement("div");
      header.className = "board-column__header";
      header.innerHTML = `
        <span class="board-column__title">${col.title}</span>
        <span class="board-column__count">${buckets[col.key].length}</span>
      `;
      columnEl.appendChild(header);

      const body = document.createElement("div");
      body.className = "board-column__body";
      body.appendChild(renderTaskList(buckets[col.key], cardHandlers, ""));
      columnEl.appendChild(body);

      body.addEventListener("dragover", (event) => {
        event.preventDefault();
        columnEl.classList.add("board-column--over");
      });
      body.addEventListener("dragleave", () => {
        columnEl.classList.remove("board-column--over");
      });
      body.addEventListener("drop", (event) => {
        event.preventDefault();
        columnEl.classList.remove("board-column--over");
        const taskId = event.dataTransfer.getData("text/plain");
        if (taskId) handleDrop(taskId, col.key);
      });

      boardEl.appendChild(columnEl);
    });
  }

  // Спільна логіка переходу в колонку — і для drag-and-drop (лише
  // taskId), і для dropdown «Статус» у самій картці. Задача є в
  // tasksById (звичайний випадок — той самий getAllTasks(), що й
  // намалював поточні картки) — той самий taskStore.changeTaskStatus(),
  // що й решта сторінок (раніше тут була власна копія цієї гілки зі
  // слабшим фолбеком, який для "done" міг мовчки пропустити
  // клонування повторення — знахідка код-рев'ю). Фолбек нижче —
  // лише для вузького стану гонки, коли задачі раптом нема в кеші
  // (змінилась/зникла між останнім refreshBoard() і цим
  // перетягуванням) і повного об'єкта для клонування повторення
  // немає.
  async function moveTaskToColumn(taskId, columnKey) {
    const task = tasksById.get(taskId);
    if (task) {
      await changeTaskStatus(task, columnKey);
      return;
    }

    if (columnKey === "done") {
      await setTaskCompleted(taskId, true);
    } else {
      // Перетягнута/перемкнута назад із «Виконаних» задача має
      // реально покинути цю колонку — bucketOf() інакше й далі
      // вважав би її виконаною незалежно від status.
      await setTaskCompleted(taskId, false);
      await setTaskStatus(taskId, columnKey);
    }
  }

  async function handleDrop(taskId, columnKey) {
    try {
      await moveTaskToColumn(taskId, columnKey);
      await refreshBoard();
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося перемістити задачу. Спробуйте ще раз.");
    }
  }

  async function handleToggleCompleted(task, completed) {
    await toggleTaskCompleted(task, completed);
    await refreshBoard();
  }

  async function handleDelete(task) {
    await moveTaskToTrash(task.id);
    await refreshBoard();
  }

  async function handleEditTask(task, values) {
    await updateTask(task.id, values);
    await refreshBoard();
  }

  async function handleStatusChange(task, status) {
    await moveTaskToColumn(task.id, status);
    await refreshBoard();
  }

  async function handleListChange(task, list) {
    await setTaskList(task.id, list);
    await refreshBoard();
  }

  async function handleDueDateChange(task, dueDate) {
    await setTaskDueDate(task.id, dueDate);
    await refreshBoard();
  }

  async function handleRecurrenceChange(task, recurrence) {
    await setTaskRecurrence(task.id, recurrence, task.due_date);
    await refreshBoard();
  }

  async function handleRecurrenceWindowChange(task, windowDays) {
    await setTaskRecurrenceWindow(task.id, windowDays);
    await refreshBoard();
  }

  async function handleSkipTask(task) {
    await skipTask(task);
    await refreshBoard();
  }

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refreshBoard();
  }

  await refreshBoard();
}
