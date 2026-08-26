// Сторінка «Вхідні» (/inbox).
// Задачі — з реальної бази через js/store/taskStore.js. Форма
// монтується один раз; після будь-якої дії над самою задачею
// (додати/відмітити/кошик/тег/пріоритет/список/дедлайн)
// перемальовується лише список. Підзадачі — виняток, ними керує
// сама картка (TaskCard.js) без перемальовування списку.

import {
  getTasks,
  addTask,
  updateTask,
  setTaskCompleted,
  completeTask,
  moveTaskToTrash,
  setTaskStatus,
  setTaskList,
  setTaskDueDate,
  setTaskRecurrence,
  setTaskRecurrenceWindow,
  setTaskTags,
} from "../store/taskStore.js";
import { suggestNextTaskWithAI } from "../store/aiStore.js";
import { renderTaskForm } from "../components/TaskForm.js";
import { renderTaskList } from "../components/TaskList.js";
import { renderNextTaskSuggestion } from "../components/NextTaskSuggestion.js";

export async function renderInbox(root) {
  root.innerHTML = `<h1 class="page__title">Вхідні</h1>`;

  root.appendChild(renderNextTaskSuggestion(handleSuggestNextTask));
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
        onEditTask: handleEditTask,
        onStatusChange: handleStatusChange,
        onListChange: handleListChange,
        onDueDateChange: handleDueDateChange,
        onRecurrenceChange: handleRecurrenceChange,
        onRecurrenceWindowChange: handleRecurrenceWindowChange,
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
    // Виконання повторюваної задачі (task.recurrence) саме створює
    // нову задачу на наступну дату — completeTask() робить обидві
    // дії разом; для звичайного зняття позначки чи задач без
    // recurrence completeTask() поводиться як просте setTaskCompleted().
    if (completed) await completeTask(task);
    else await setTaskCompleted(task.id, false);
    await refreshList();
  }

  async function handleDelete(task) {
    await moveTaskToTrash(task.id);
    await refreshList();
  }

  async function handleEditTask(task, values) {
    await updateTask(task.id, values);
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

  async function handleRecurrenceChange(task, recurrence) {
    await setTaskRecurrence(task.id, recurrence, task.due_date);
    await refreshList();
  }

  async function handleRecurrenceWindowChange(task, windowDays) {
    await setTaskRecurrenceWindow(task.id, windowDays);
    await refreshList();
  }

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refreshList();
  }

  // До 10 задач зі списку «Задачі» (list = "next") — саме звідти,
  // а не «Вхідних», бо там ще нерозібрані нотатки, а не готові до
  // виконання кроки.
  async function handleSuggestNextTask() {
    const tasks = await getTasks("next");
    if (tasks.length === 0) return null;

    const candidates = tasks.slice(0, 10).map((t) => ({ id: t.id, title: t.title }));
    const { taskId, reason } = await suggestNextTaskWithAI(candidates);

    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("ШІ повернув задачу поза списком.");

    return { task, reason };
  }

  await refreshList();
}
