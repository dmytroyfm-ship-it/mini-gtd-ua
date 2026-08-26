// Сторінка «Колись» (/list/someday) — два незалежні розділи на
// одній сторінці: сам список «Колись» (list: someday) і задачі
// статусу «В очікуванні» (status: waiting) незалежно від їхнього
// list — щоб «відкладене на потім» і «чекаю на когось» не губились
// одне серед одного, але й не плодили окрему вкладку в навігації.
//
// Обидва розділи використовують той самий набір handlers (та сама
// дія скрізь одна) і після будь-якої зміни перемальовують ОБИДВА —
// зміна статусу задачі на/з "waiting" переносить її з одного
// розділу в інший, тож оновлювати лише один розділ недостатньо.

import {
  getTasks,
  getWaitingTasks,
  updateTask,
  setTaskCompleted,
  completeTask,
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

export async function renderSomeday(root) {
  root.innerHTML = `
    <h1 class="page__title">Колись</h1>
    <section class="someday-section">
      <h2 class="someday-section__title">Колись</h2>
      <div class="someday-section__slot"><p class="page__text">Завантаження…</p></div>
    </section>
    <section class="someday-section">
      <h2 class="someday-section__title">В очікуванні</h2>
      <div class="someday-section__slot"><p class="page__text">Завантаження…</p></div>
    </section>
  `;

  const [somedaySlot, waitingSlot] = root.querySelectorAll(".someday-section__slot");

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

  async function refreshSomeday() {
    let nextEl;
    try {
      const tasks = await getTasks("someday");
      nextEl = renderTaskList(tasks, cardHandlers, "Тут з'являться задачі, перенесені сюди зі «Вхідних».");
    } catch (err) {
      console.error(err);
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = "Не вдалося завантажити задачі. Спробуйте оновити сторінку.";
    }
    somedaySlot.replaceChildren(nextEl);
  }

  async function refreshWaiting() {
    let nextEl;
    try {
      const tasks = await getWaitingTasks();
      nextEl = renderTaskList(tasks, cardHandlers, "Немає задач у статусі «В очікуванні».");
    } catch (err) {
      console.error(err);
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = "Не вдалося завантажити задачі. Спробуйте оновити сторінку.";
    }
    waitingSlot.replaceChildren(nextEl);
  }

  async function refreshAll() {
    await Promise.all([refreshSomeday(), refreshWaiting()]);
  }

  async function handleToggleCompleted(task, completed) {
    if (completed) await completeTask(task);
    else await setTaskCompleted(task.id, false);
    await refreshAll();
  }

  async function handleDelete(task) {
    await moveTaskToTrash(task.id);
    await refreshAll();
  }

  async function handleEditTask(task, values) {
    await updateTask(task.id, values);
    await refreshAll();
  }

  async function handleStatusChange(task, status) {
    await changeTaskStatus(task, status);
    await refreshAll();
  }

  async function handleListChange(task, list) {
    await setTaskList(task.id, list);
    await refreshAll();
  }

  async function handleDueDateChange(task, dueDate) {
    await setTaskDueDate(task.id, dueDate);
    await refreshAll();
  }

  async function handleRecurrenceChange(task, recurrence) {
    await setTaskRecurrence(task.id, recurrence, task.due_date);
    await refreshAll();
  }

  async function handleRecurrenceWindowChange(task, windowDays) {
    await setTaskRecurrenceWindow(task.id, windowDays);
    await refreshAll();
  }

  async function handleSkipTask(task) {
    await skipTask(task);
    await refreshAll();
  }

  async function handleAddTag(task, tag) {
    await setTaskTags(task.id, [...(task.tags || []), tag]);
    await refreshAll();
  }

  await refreshAll();
}
