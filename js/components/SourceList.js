// Список джерел: колонка рядків (SourceItem.js) або порожній стан.

import { renderSourceItem } from "./SourceItem.js";

export function renderSourceList(sources, handlers) {
  if (sources.length === 0) {
    const empty = document.createElement("p");
    empty.className = "page__text";
    empty.textContent = "Джерел ще нема — додай перше формою вище.";
    return empty;
  }

  const list = document.createElement("ul");
  list.className = "source-list";

  sources.forEach((source) => {
    list.appendChild(renderSourceItem(source, handlers));
  });

  return list;
}
