// Сторінка «Задачі» (/list/next).
// Без форми додавання — нові задачі створюються у «Вхідних» і
// сюди потрапляють через перенесення (dropdown «Список» у
// TaskCard.js). Решта — той самий підхід, що й pages/inbox.js.

import {
  getTasks,
  setTaskCompleted,
  moveTaskToTrash,
  setTaskStatus,
  setTaskList,
  setTaskDueDate,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskList } from "../components/TaskList.js";

export async function renderNext(root) {
  root.innerHTML = `<h1 class="page__title">Задачі</h1>`;

  let listSlot = document.createElement("p");
  listSlot.className = "page__text";
  listSlot.textContent = "Завантаження…";
  root.appendChild(listSlot);

  async function refreshList() {
    let nextEl;

    try {
      const tasks = await getTasks("next");
      nextEl = renderTaskList(
        tasks,
        {
          onToggleCompleted: handleToggleCompleted,
          onDelete: handleDelete,
          onStatusChange: handleStatusChange,
          onListChange: handleListChange,
          onDueDateChange: handleDueDateChange,
          onAddTag: handleAddTag,
        },
        "Тут з'являться задачі, перенесені сюди зі «Вхідних»."
      );
    } catch (err) {
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = err?.message || "Не вдалося завантажити задачі.";
    }

    listSlot.replaceWith(nextEl);
    listSlot = nextEl;
  }

  async function handleToggleCompleted(task, completed) {
    await setTaskCompleted(task.id, completed);
    await refreshList();
  }

  async function handleDelete(task) {
    await moveTaskToTrash(task.id);
    await refreshList();
  }

  async function handleStatusChange(task, status) {
    await setTaskCompleted(task.id, false);
    await setTaskStatus(task.id, status);
    await refreshList();
  }

  async function handleListChange(task, list) {
    await setTaskList(task.id, list);
    await refreshList();
  }

  async function handleDueDateChange(task, dueDate) {
    await setTaskDueDate(task.id, dueDate);
    await refreshList();
  }

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refreshList();
  }

  await refreshList();
}
