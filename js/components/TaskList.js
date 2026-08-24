// Список задач: колонка повних карток (TaskCard.js) або порожній
// стан, якщо задач немає.

import { renderTaskCard } from "./TaskCard.js";

export function renderTaskList(tasks, handlers) {
  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task-list-card";
    empty.innerHTML = `
      <div class="task-list-card__empty">
        <svg class="task-list-card__empty-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="32" cy="32" r="29" stroke="currentColor" stroke-width="3" />
          <path d="M20 33.5L28 41.5L44 24.5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="task-list-card__empty-title">Все чисто!</p>
        <p class="task-list-card__empty-text">Додайте першу задачу формою вище ☝️</p>
      </div>
    `;
    return empty;
  }

  const list = document.createElement("ul");
  list.className = "task-card-list";

  tasks.forEach((task) => {
    list.appendChild(renderTaskCard(task, handlers));
  });

  return list;
}
