// Сторінка «Пошук» (/search) — за словом (назва/нотатка) чи тегом,
// по всіх активних списках одразу, включно з «Історією»
// (taskStore.searchTasks()). Той самий підхід до мутацій, що й на
// решті сторінок: виклик функції стору → runSearch() заново (не
// getTasks()/getAllTasks() — той самий пошуковий запит, інакше після
// дії список непередбачувано зміниться на щось геть інше).

import {
  searchTasks,
  updateTask,
  toggleTaskCompleted,
  skipTask,
  moveTaskToTrash,
  changeTaskStatus,
  setTaskList,
  setTaskDueDate,
  setTaskRecurrence,
  setTaskRecurrenceWindow,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskList } from "../components/TaskList.js";

let pendingQuery = "";

// Викликає Nav.js перед переходом на /search — маршрутизація
// (js/router.js) не підтримує query-рядки (?q=...), а городити її
// заради єдиної сторінки не варто. Сторінка сама читає значення один
// раз при рендері.
export function setPendingSearchQuery(query) {
  pendingQuery = query;
}

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

export async function renderSearch(root) {
  const initialQuery = pendingQuery;
  pendingQuery = ""; // одноразово — оновлення сторінки (F5) не мало б повторювати старий запит

  root.innerHTML = `
    <h1 class="page__title">Пошук</h1>
    <form class="search-page__form">
      <input
        type="search"
        class="search-page__input"
        placeholder="Слово чи тег…"
        value="${escapeHtml(initialQuery)}"
        aria-label="Пошук задач за словом чи тегом"
      />
      <button type="submit" class="search-page__submit">Знайти</button>
    </form>
    <div class="search-page__slot"></div>
  `;

  const form = root.querySelector(".search-page__form");
  const input = root.querySelector(".search-page__input");
  const slot = root.querySelector(".search-page__slot");

  let currentQuery = initialQuery;

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
  };

  async function runSearch(query) {
    currentQuery = query;

    if (!query) {
      slot.innerHTML = `<p class="page__text">Введіть слово чи тег для пошуку.</p>`;
      return;
    }

    slot.innerHTML = `<p class="page__text">Шукаю…</p>`;

    let tasks;
    try {
      tasks = await searchTasks(query);
    } catch (err) {
      console.error(err);
      slot.innerHTML = `<p class="page__text">Не вдалося виконати пошук. Спробуйте ще раз.</p>`;
      return;
    }

    slot.innerHTML = "";
    slot.appendChild(renderTaskList(tasks, cardHandlers, `За запитом «${escapeHtml(query)}» нічого не знайдено.`));
  }

  async function refresh() {
    await runSearch(currentQuery);
  }

  async function handleToggleCompleted(task, completed) {
    await toggleTaskCompleted(task, completed);
    await refresh();
  }

  async function handleDelete(task) {
    await moveTaskToTrash(task.id);
    await refresh();
  }

  async function handleEditTask(task, values) {
    await updateTask(task.id, values);
    await refresh();
  }

  async function handleStatusChange(task, status) {
    await changeTaskStatus(task, status);
    await refresh();
  }

  async function handleListChange(task, list) {
    await setTaskList(task.id, list);
    await refresh();
  }

  async function handleDueDateChange(task, dueDate) {
    await setTaskDueDate(task.id, dueDate);
    await refresh();
  }

  async function handleRecurrenceChange(task, recurrence) {
    await setTaskRecurrence(task.id, recurrence, task.due_date);
    await refresh();
  }

  async function handleRecurrenceWindowChange(task, windowDays) {
    await setTaskRecurrenceWindow(task.id, windowDays);
    await refresh();
  }

  async function handleSkipTask(task) {
    await skipTask(task);
    await refresh();
  }

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refresh();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(input.value.trim());
  });

  await runSearch(initialQuery);
}
