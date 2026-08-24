// Сторінка «Вхідні» (/inbox).
// Задачі — з реальної бази через js/store/taskStore.js. Форма
// монтується один раз; після будь-якої дії (додати/відмітити/
// видалити) перемальовується лише список.

import { getTasks, addTask, setTaskCompleted, moveTaskToTrash } from "../store/taskStore.js";
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
      nextEl = renderTaskList(tasks, { onToggle: handleToggle, onDelete: handleDelete });
    } catch (err) {
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = err instanceof Error ? err.message : "Не вдалося завантажити задачі.";
    }

    listSlot.replaceWith(nextEl);
    listSlot = nextEl;
  }

  async function handleAdd(values) {
    await addTask(values);
    await refreshList();
  }

  async function handleToggle(task, completed) {
    await setTaskCompleted(task.id, completed);
    await refreshList();
  }

  async function handleDelete(task) {
    await moveTaskToTrash(task.id);
    await refreshList();
  }

  await refreshList();
}
