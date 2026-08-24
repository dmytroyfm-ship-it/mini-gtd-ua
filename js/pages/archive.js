// Сторінка «Архів» (/list/archive).

import { createListPage } from "./listPage.js";

export const renderArchive = createListPage({
  list: "archive",
  title: "Архів",
  emptyText: "Тут з'являться задачі, перенесені сюди зі «Вхідних».",
});
