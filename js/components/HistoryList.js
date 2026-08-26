// Список «Історії»: картка з рядками виконаних/скасованих задач або
// текст-заглушка, якщо за вибраний період нічого нема.

import { renderHistoryItem } from "./HistoryItem.js";

export function renderHistoryList(tasks, handlers, emptyText) {
  const card = document.createElement("div");
  card.className = "task-list-card";

  if (tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-list__empty";
    empty.textContent = emptyText || "Тут з'являться виконані й скасовані задачі.";
    card.appendChild(empty);
    return card;
  }

  const list = document.createElement("ul");
  list.className = "history-list";

  tasks.forEach((task) => {
    list.appendChild(renderHistoryItem(task, handlers));
  });

  card.appendChild(list);
  return card;
}
