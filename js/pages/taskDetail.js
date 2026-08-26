// Сторінка детального перегляду задачі (/task/:id).
// Велика картка (TaskCard.js з detail: true) з деталізованими
// підзадачами (власні дедлайн і теги — detailedSubtasks: true) +
// блоки «Матеріали» й «Коментарі» під нею. Мутації самої задачі —
// той самий підхід, що й на «Вхідних»: виклик функції стору, тоді
// перечитування задачі й перемальовування картки.

import {
  getTaskById,
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
import { renderTaskCard } from "../components/TaskCard.js";
import { renderMaterialsBlock } from "../components/MaterialsBlock.js";
import { renderCommentsBlock } from "../components/CommentsBlock.js";
import { navigate } from "../router.js";

export async function renderTaskDetail(root, params) {
  root.innerHTML = "";

  const backLink = document.createElement("a");
  backLink.href = "/inbox";
  backLink.dataset.link = "";
  backLink.className = "task-detail__back";
  backLink.textContent = "← Назад до списку";
  root.appendChild(backLink);

  const content = document.createElement("div");
  content.className = "task-detail__content";
  root.appendChild(content);

  let task = null;

  async function loadTask() {
    content.innerHTML = `<p class="page__text">Завантаження…</p>`;

    try {
      task = await getTaskById(params.id);
    } catch (err) {
      console.error(err);
      content.innerHTML = "";
      const error = document.createElement("p");
      error.className = "page__text";
      error.textContent = "Задачу не знайдено.";
      content.appendChild(error);
      return false;
    }

    renderCard();
    return true;
  }

  function renderCard() {
    content.innerHTML = "";

    const card = renderTaskCard(task, {
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
      detail: true,
      detailedSubtasks: true,
    });

    // renderTaskCard повертає <li> для списків карток — тут вона
    // сама по собі, без обгортки <ul>, тож звичайний <div> цілком
    // підходить.
    const cardWrapper = document.createElement("div");
    cardWrapper.appendChild(card);
    content.appendChild(cardWrapper);

    content.appendChild(renderMaterialsBlock(task.id));
    content.appendChild(renderCommentsBlock(task.id));
  }

  async function handleToggleCompleted(t, completed) {
    // Повторювана задача (t.recurrence) — toggleTaskCompleted()
    // створює нову задачу на наступну дату; лишаємось на цій самій
    // сторінці (тепер вона показує вже виконану задачу), нову можна
    // знайти в списку — без несподіваного переходу.
    await toggleTaskCompleted(t, completed);
    await loadTask();
  }

  async function handleDelete(t) {
    await moveTaskToTrash(t.id);
    navigate("/inbox");
  }

  async function handleEditTask(t, values) {
    await updateTask(t.id, values);
    await loadTask();
  }

  async function handleStatusChange(t, status) {
    await changeTaskStatus(t, status);
    await loadTask();
  }

  async function handleListChange(t, list) {
    await setTaskList(t.id, list);
    await loadTask();
  }

  async function handleDueDateChange(t, dueDate) {
    await setTaskDueDate(t.id, dueDate);
    await loadTask();
  }

  async function handleRecurrenceChange(t, recurrence) {
    await setTaskRecurrence(t.id, recurrence, t.due_date);
    await loadTask();
  }

  async function handleRecurrenceWindowChange(t, windowDays) {
    await setTaskRecurrenceWindow(t.id, windowDays);
    await loadTask();
  }

  async function handleSkipTask(t) {
    await skipTask(t);
    await loadTask();
  }

  async function handleAddTag(t, tag) {
    await setTaskTags(t.id, [...(t.tags || []), tag]);
    await loadTask();
  }

  await loadTask();
}
