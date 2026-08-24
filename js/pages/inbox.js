// Сторінка «Вхідні» (/inbox).
// Задачі — з реальної бази через js/store/taskStore.js. Форма
// монтується один раз; після будь-якої дії над самою задачею
// (додати/відмітити/кошик/тег/пріоритет/список/дедлайн)
// перемальовується лише список. Підзадачі — виняток, ними керує
// сама картка (TaskCard.js) без перемальовування списку.

import {
  getTasks,
  addTask,
  setTaskCompleted,
  moveTaskToTrash,
  setTaskStatus,
  setTaskList,
  setTaskDueDate,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskForm } from "../components/TaskForm.js";
import { renderTaskList } from "../components/TaskList.js";

export async function renderInbox(root) {
  root.innerHTML = `<h1 class="page__title">Вхідні</h1>`;

  root.appendChild(renderTaskForm(handleAdd));

  let listSlot = document.createElement("p");
  listSlot.className = "page__text";
  listSlot.textContent = "Завантаження…";
  root.appendChild(listSlot);

  async function refreshList() {
    let nextEl;

    try {
      const tasks = await getTasks("inbox");
      nextEl = renderTaskList(tasks, {
        onToggleCompleted: handleToggleCompleted,
        onDelete: handleDelete,
        onStatusChange: handleStatusChange,
        onListChange: handleListChange,
        onDueDateChange: handleDueDateChange,
        onAddTag: handleAddTag,
      });
    } catch (err) {
      console.error(err);
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = "Не вдалося завантажити задачі. Спробуйте оновити сторінку.";
    }

    listSlot.replaceWith(nextEl);
    listSlot = nextEl;
  }

  async function handleAdd(values) {
    await addTask(values);
    await refreshList();
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
    // Синхронізовано з дошкою (/board) — та сама логіка, що й у
    // board.js: зміна статусу знімає позначку «виконано», інакше
    // задача лишалась би застряглою серед виконаних на дошці.
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
