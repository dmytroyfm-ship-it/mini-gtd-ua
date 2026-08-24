// Сторінка «Читати / Дивитись» (/list/read_watch).

import { createListPage } from "./listPage.js";

export const renderReadWatch = createListPage({
  list: "read_watch",
  title: "Читати / Дивитись",
  emptyText: "Тут з'являться задачі, перенесені сюди зі «Вхідних».",
});
