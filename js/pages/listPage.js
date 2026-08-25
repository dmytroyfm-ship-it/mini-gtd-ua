// Фабрика для сторінок-списків без форми додавання («Задачі»,
// «Читати / Дивитись», «Колись», «Архів») — усі показують реальні
// задачі одного list, з тими самими діями, що й на «Вхідних», але
// без форми (нові задачі створюються лише у «Вхідних», сюди
// потрапляють через перенесення). Замість дублювати цю логіку в
// кожному файлі — одна фабрика, кожна сторінка лишається окремим
// файлом (PROJECT_RULES, п.3), просто тонкою обгорткою над нею.
//
// Помилки бази показуються користувачу українською завжди —
// технічний текст від Supabase (англійською) іде лише в консоль,
// для діагностики, не на екран.

import {
  getTasks,
  updateTask,
  setTaskCompleted,
  completeTask,
  moveTaskToTrash,
  setTaskStatus,
  setTaskList,
  setTaskDueDate,
  setTaskRecurrence,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskList } from "../components/TaskList.js";

export function createListPage({ list, title, emptyText }) {
  return async function renderListPage(root) {
    root.innerHTML = `<h1 class="page__title">${title}</h1>`;

    let listSlot = document.createElement("p");
    listSlot.className = "page__text";
    listSlot.textContent = "Завантаження…";
    root.appendChild(listSlot);

    async function refreshList() {
      let nextEl;

      try {
        const tasks = await getTasks(list);
        nextEl = renderTaskList(
          tasks,
          {
            onToggleCompleted: handleToggleCompleted,
            onDelete: handleDelete,
            onEditTask: handleEditTask,
            onStatusChange: handleStatusChange,
            onListChange: handleListChange,
            onDueDateChange: handleDueDateChange,
            onRecurrenceChange: handleRecurrenceChange,
            onAddTag: handleAddTag,
          },
          emptyText
        );
      } catch (err) {
        console.error(err);
        nextEl = document.createElement("p");
        nextEl.className = "page__text";
        nextEl.textContent = "Не вдалося завантажити задачі. Спробуйте оновити сторінку.";
      }

      listSlot.replaceWith(nextEl);
      listSlot = nextEl;
    }

    async function handleToggleCompleted(task, completed) {
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
      await setTaskCompleted(task.id, false);
      await setTaskStatus(task.id, status);
      await refreshList();
    }

    async function handleListChange(task, newList) {
      await setTaskList(task.id, newList);
      await refreshList();
    }

    async function handleDueDateChange(task, dueDate) {
      await setTaskDueDate(task.id, dueDate);
      await refreshList();
    }

    async function handleRecurrenceChange(task, recurrence) {
      await setTaskRecurrence(task.id, recurrence);
      await refreshList();
    }

    async function handleAddTag(task, tag) {
      await setTaskTags(task.id, [...(task.tags || []), tag]);
      await refreshList();
    }

    await refreshList();
  };
}
