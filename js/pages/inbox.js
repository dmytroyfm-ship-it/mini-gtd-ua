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
        onEditTask: handleEditTask,
        onStatusChange: handleStatusChange,
        onListChange: handleListChange,
        onDueDateChange: handleDueDateChange,
        onRecurrenceChange: handleRecurrenceChange,
        onRecurrenceWindowChange: handleRecurrenceWindowChange,
        onSkipTask: handleSkipTask,
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
    // нову задачу на наступну дату — toggleTaskCompleted() робить
    // обидві дії разом (той самий шлях, що й changeTaskStatus() для
    // dropdown статусу, в taskStore.js).
    await toggleTaskCompleted(task, completed);
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
    // Той самий taskStore.changeTaskStatus(), що й скрізь — і те
    // саме джерело правди, що й дошка (/board): «Виконані» серед
    // пунктів веде через completeTask() (повторення й далі коректно
    // клонується), інакше знімає позначку «виконано» й ставить
    // звичайний статус.
    await changeTaskStatus(task, status);
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

  async function handleSkipTask(task) {
    await skipTask(task);
    await refreshList();
  }

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refreshList();
  }

  await refreshList();
}
