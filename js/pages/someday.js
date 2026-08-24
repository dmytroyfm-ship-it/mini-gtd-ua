// Сторінка «Колись» (/list/someday).

import { createListPage } from "./listPage.js";

export const renderSomeday = createListPage({
  list: "someday",
  title: "Колись",
  emptyText: "Тут з'являться задачі, перенесені сюди зі «Вхідних».",
  hideSubtasks: true,
});
