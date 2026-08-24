// Список кошика: картка з рядками видалених задач або текст
// «Кошик порожній.», якщо видалених задач немає.

import { renderTrashItem } from "./TrashItem.js";

export function renderTrashList(tasks, handlers) {
  const card = document.createElement("div");
  card.className = "task-list-card";

  if (tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "trash-list__empty";
    empty.textContent = "Кошик порожній.";
    card.appendChild(empty);
    return card;
  }

  const list = document.createElement("ul");
  list.className = "trash-list";

  tasks.forEach((task) => {
    list.appendChild(renderTrashItem(task, handlers));
  });

  card.appendChild(list);
  return card;
}
