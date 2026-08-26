// Повна картка задачі — «пульт керування»: збирає в один <li> п'ять
// самодостатніх блоків, кожен свій файл (правило №3 PROJECT_RULES —
// один компонент, один файл; цей файл був переріс 670+ рядків,
// поєднуючи всі блоки разом, тож винесено):
//   - TaskCardHeader.js    — чекбокс/назва/✎/кошик + інлайн-редагування
//   - TaskCardTags.js      — теги + «+ тег»
//   - TaskCardMeta.js      — dropdown «Статус»/«Список»
//   - TaskCardDueDate.js   — дедлайн, період, повторення, «⏭ Пропустити»
//   - TaskCardSubtasks.js  — «✨ Розбити на кроки» + список підзадач
//
// Dropdown «Статус» (TaskCardMeta.js) керує тим самим полем status,
// що й колонки дошки /board (drag-and-drop) — навмисно один і той
// самий dropdown-набір, синхронізований через єдине джерело правди
// в базі: зміна тут одразу відображається на дошці, і навпаки.
// «Виконані» серед пунктів — псевдо-опція ("done"), обробляється
// через taskStore.changeTaskStatus().
//
// Мутації самої задачі (тег/статус/список/дедлайн/виконано/кошик)
// віддаються нагору через handlers — той самий підхід, що вже є в
// pages/inbox.js (виклик функції стору → перемальовування списку).
// Підзадачі — виняток: керуються прямо в TaskCardSubtasks.js, без
// перемальовування решти картки, бо не впливають на те, які задачі
// показані у списку (PROJECT_RULES, п.6 — бізнес-логіка в store,
// не тут).

import { renderTaskCardHeader } from "./TaskCardHeader.js";
import { renderTaskCardTags } from "./TaskCardTags.js";
import { renderTaskCardMeta } from "./TaskCardMeta.js";
import { renderTaskCardDueDate } from "./TaskCardDueDate.js";
import { renderTaskCardSubtasks } from "./TaskCardSubtasks.js";

export function renderTaskCard(task, handlers = {}) {
  const { draggable, detail } = handlers;

  const card = document.createElement("li");
  card.className = "task-card";
  if (task.completed) card.classList.add("task-card--completed");
  // detail — більша версія картки для сторінки /task/:id («велика
  // картка» замість компактного рядка списку); та сама розмітка,
  // лише інший масштаб через CSS-модифікатор.
  if (detail) card.classList.add("task-card--detail");

  // draggable — вмикається лише сторінкою, якій це треба (дошка
  // /board); на «Вхідних»/«Задачах» handlers.draggable немає, і
  // картка лишається звичайною, без перетягування.
  if (draggable) {
    card.draggable = true;
    card.classList.add("task-card--draggable");
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", task.id);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("task-card--dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("task-card--dragging");
    });
  }

  card.appendChild(renderTaskCardHeader(task, handlers));
  card.appendChild(renderTaskCardTags(task, handlers));
  card.appendChild(renderTaskCardMeta(task, handlers));
  card.appendChild(renderTaskCardDueDate(task, handlers));
  card.appendChild(renderTaskCardSubtasks(task, handlers));

  return card;
}
