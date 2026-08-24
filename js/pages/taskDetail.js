// Сторінка детального перегляду задачі (/task/:id).
// Велика картка (TaskCard.js з detail: true) з деталізованими
// підзадачами (власні дедлайн і теги — detailedSubtasks: true) +
// блок «Матеріали» під нею. Мутації самої задачі — той самий
// підхід, що й на «Вхідних»: виклик функції стору, тоді
// перечитування задачі й перемальовування картки.

import {
  getTaskById,
  setTaskCompleted,
  moveTaskToTrash,
  setTaskStatus,
  setTaskList,
  setTaskDueDate,
  setTaskTags,
} from "../store/taskStore.js";
import { renderTaskCard } from "../components/TaskCard.js";
import { renderMaterialsBlock } from "../components/MaterialsBlock.js";
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
      onStatusChange: handleStatusChange,
      onListChange: handleListChange,
      onDueDateChange: handleDueDateChange,
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
  }

  async function handleToggleCompleted(t, completed) {
    await setTaskCompleted(t.id, completed);
    await loadTask();
  }

  async function handleDelete(t) {
    await moveTaskToTrash(t.id);
    navigate("/inbox");
  }

  async function handleStatusChange(t, status) {
    await setTaskCompleted(t.id, false);
    await setTaskStatus(t.id, status);
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

  async function handleAddTag(t, tag) {
    await setTaskTags(t.id, [...(t.tags || []), tag]);
    await loadTask();
  }

  await loadTask();
}
