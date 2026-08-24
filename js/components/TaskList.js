// Список задач: картка з рядками задач або порожній стан, якщо
// задач немає.

import { renderTaskItem } from "./TaskItem.js";

export function renderTaskList(tasks, handlers) {
  const card = document.createElement("div");
  card.className = "task-list-card";

  if (tasks.length === 0) {
    card.innerHTML = `
      <div class="task-list-card__empty">
        <svg class="task-list-card__empty-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="32" cy="32" r="29" stroke="currentColor" stroke-width="3" />
          <path d="M20 33.5L28 41.5L44 24.5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="task-list-card__empty-title">Все чисто!</p>
        <p class="task-list-card__empty-text">Додайте першу задачу формою вище ☝️</p>
      </div>
    `;
    return card;
  }

  const list = document.createElement("ul");
  list.className = "task-list";

  tasks.forEach((task) => {
    list.appendChild(renderTaskItem(task, handlers));
  });

  card.appendChild(list);
  return card;
}
