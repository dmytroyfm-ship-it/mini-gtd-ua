// Список постів стрічки: колонка карток (FeedCard.js) або порожній
// стан. Той самий вигляд порожнього стану, що й у TaskList.js
// (.task-list-card__empty*) — не дублюємо стилі під нову назву.

import { renderFeedCard } from "./FeedCard.js";

export function renderFeedList(items, handlers) {
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task-list-card";
    empty.innerHTML = `
      <div class="task-list-card__empty">
        <svg class="task-list-card__empty-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="32" cy="32" r="29" stroke="currentColor" stroke-width="3" />
          <path d="M20 33.5L28 41.5L44 24.5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="task-list-card__empty-title">Стрічка порожня!</p>
        <p class="task-list-card__empty-text">Нові пости з'являться тут, щойно джерела щось опублікують.</p>
      </div>
    `;
    return empty;
  }

  const list = document.createElement("ul");
  list.className = "feed-list";

  items.forEach((item) => {
    list.appendChild(renderFeedCard(item, handlers));
  });

  return list;
}
