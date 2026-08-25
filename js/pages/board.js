// Дошка Kanban (/board): усі активні задачі користувача (без
// видалених), розкладені по шести колонках статусів — усі одразу,
// без спойлера. Перетягування картки в іншу колонку одразу оновлює
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
  updateTask,
  setTaskStatus,
  setTaskCompleted,
  completeTask,
  moveTaskToTrash,
  setTaskList,
  setTaskDueDate,
  setTaskRecurrence,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskList } from "../components/TaskList.js";

const COLUMNS = [
  { key: "urgent", title: "Термінові" },
  { key: "not_urgent", title: "Не термінові" },
  { key: "daily", title: "Щоденні" },
  { key: "done", title: "Виконані" },
  { key: "cancelled", title: "Скасовані" },
  { key: "waiting", title: "В очікуванні" },
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

  // Наповнюється в refreshBoard() — потрібен для completeTask() у
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

    // Перетягування (handleDrop) знає лише taskId, не повний
    // об'єкт — а completeTask() нижче потребує саме його
    // (title/note/list/tags/status/recurrence для нової задачі).
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

  // Спільна логіка переходу в колонку — і для drag-and-drop, і для
  // dropdown «Статус» у самій картці (та сама дія, два способи її
  // викликати; картка ніколи не передає "done" — там немає такого
  // пункту, є лише окремий чекбокс «виконано»).
  async function moveTaskToColumn(taskId, columnKey) {
    if (columnKey === "done") {
      // completeTask() потребує повний об'єкт задачі (для
      // повторення — title/note/list/tags/status/recurrence нової
      // задачі); tasksById заповнюється в refreshBoard().
      const task = tasksById.get(taskId);
      if (task) await completeTask(task);
      else await setTaskCompleted(taskId, true);
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
    if (completed) await completeTask(task);
    else await setTaskCompleted(task.id, false);
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
    await setTaskRecurrence(task.id, recurrence);
    await refreshBoard();
  }

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refreshBoard();
  }

  await refreshBoard();
}
