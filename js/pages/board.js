// Дошка Kanban (/board): усі активні задачі користувача (без
// видалених), розкладені по колонках — три видимі («Термінові»,
// «Не термінові», «Щоденні») і три приховані під спойлером
// («Виконані», «Скасовані», «В очікуванні»). Перетягування картки
// в іншу колонку одразу оновлює status (нативний HTML5 drag-and-
// drop — без бібліотек). Той самий status керується і dropdown
// «Статус» прямо в картці (TaskCard.js) — де завгодно змінили,
// синхронізовано скрізь, бо це одне й те саме поле в базі.
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
  setTaskStatus,
  setTaskCompleted,
  moveTaskToTrash,
  setTaskList,
  setTaskDueDate,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskList } from "../components/TaskList.js";

const VISIBLE_COLUMNS = [
  { key: "urgent", title: "Термінові" },
  { key: "not_urgent", title: "Не термінові" },
  { key: "daily", title: "Щоденні" },
];

const HIDDEN_COLUMNS = [
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
  root.innerHTML = `<h1 class="page__title">Дошка</h1>`;

  const boardEl = document.createElement("div");
  boardEl.className = "board";
  root.appendChild(boardEl);

  const hiddenToggle = document.createElement("button");
  hiddenToggle.type = "button";
  hiddenToggle.className = "board-hidden-toggle";
  hiddenToggle.textContent = "Показати приховані статуси";
  root.appendChild(hiddenToggle);

  const hiddenBoardEl = document.createElement("div");
  hiddenBoardEl.className = "board board--hidden";
  hiddenBoardEl.hidden = true;
  root.appendChild(hiddenBoardEl);

  hiddenToggle.addEventListener("click", () => {
    hiddenBoardEl.hidden = !hiddenBoardEl.hidden;
    hiddenToggle.textContent = hiddenBoardEl.hidden
      ? "Показати приховані статуси"
      : "Сховати приховані статуси";
  });

  const cardHandlers = {
    onToggleCompleted: handleToggleCompleted,
    onDelete: handleDelete,
    onStatusChange: handleStatusChange,
    onListChange: handleListChange,
    onDueDateChange: handleDueDateChange,
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
      hiddenBoardEl.innerHTML = "";
      const error = document.createElement("p");
      error.className = "page__text";
      error.textContent = "Не вдалося завантажити задачі. Спробуйте оновити сторінку.";
      boardEl.appendChild(error);
      return;
    }

    const buckets = { urgent: [], not_urgent: [], daily: [], done: [], cancelled: [], waiting: [] };
    tasks.forEach((task) => buckets[bucketOf(task)].push(task));

    renderColumns(boardEl, VISIBLE_COLUMNS, buckets);
    renderColumns(hiddenBoardEl, HIDDEN_COLUMNS, buckets);
  }

  function renderColumns(container, columns, buckets) {
    container.innerHTML = "";

    columns.forEach((col) => {
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
      body.appendChild(renderTaskList(buckets[col.key], cardHandlers, "Порожньо."));
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

      container.appendChild(columnEl);
    });
  }

  // Спільна логіка переходу в колонку — і для drag-and-drop, і для
  // dropdown «Статус» у самій картці (та сама дія, два способи її
  // викликати; картка ніколи не передає "done" — там немає такого
  // пункту, є лише окремий чекбокс «виконано»).
  async function moveTaskToColumn(taskId, columnKey) {
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
    await setTaskCompleted(task.id, completed);
    await refreshBoard();
  }

  async function handleDelete(task) {
    await moveTaskToTrash(task.id);
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

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refreshBoard();
  }

  await refreshBoard();
}
