// Список підзадач: рядки + форма «+ Підзадача» внизу.
//
// Додавання — оптимістичне (Optimistic UI): рядок з'являється в
// списку одразу, ще до відповіді бази. Якщо збереження вдалось —
// тимчасовий id рядка тихо замінюється на справжній (щоб подальші
// відмітка/видалення працювали коректно). Якщо ні — рядок
// прибирається і показується помилка.
//
// Порядок (кнопки «↑»/«↓» у рядку — лише в detailed-режимі, на
// сторінці /task/:id, поруч із міні-тегами й міні-дедлайном) теж
// оптимістичний: рядки переставляються одразу, а onReorder лише
// зберігає новий порядок у базі (SubtaskItem сам нічого не рахує —
// уся логіка переміщення тут).

import { renderSubtaskItem } from "./SubtaskItem.js";

export function renderSubtaskList(subtasks, handlers = {}) {
  const { onToggle, onDelete, onAdd, onDueDateChange, onAddTag, onEditTitle, onReorder, detailed } = handlers;

  const wrapper = document.createElement("div");
  wrapper.className = "subtask-list-block";

  const list = document.createElement("ul");
  list.className = "subtask-list";

  // Робоча копія — тримаємо її в тому ж порядку, що й рядки в DOM
  // (індекс у масиві === індекс у list.children), щоб переміщення й
  // стан кнопок «↑»/«↓» рахувались без запитів у DOM.
  const items = [...subtasks];

  // Первинний край списку: у першого рядка «↑» неактивна, в
  // останнього — «↓». Перераховуємо після кожної структурної зміни
  // (переміщення / успішне додавання / видалення).
  function updateMoveButtons() {
    const rows = list.querySelectorAll(".subtask-item");
    rows.forEach((row, index) => {
      const up = row.querySelector(".subtask-item__move--up");
      const down = row.querySelector(".subtask-item__move--down");
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === rows.length - 1;
    });
  }

  function moveItem(subtask, direction) {
    const from = items.indexOf(subtask);
    if (from === -1) return;
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return;

    const rows = Array.from(list.children);
    [items[from], items[to]] = [items[to], items[from]];
    if (direction === "up") {
      list.insertBefore(rows[from], rows[to]);
    } else {
      list.insertBefore(rows[to], rows[from]);
    }

    updateMoveButtons();
    // onReorder сам обробляє помилку (TaskCardSubtasks — перечитує
    // список), тут просто відпускаємо.
    if (onReorder) onReorder(items.map((item) => item.id));
  }

  const itemHandlers = {
    onToggle,
    onDelete,
    onDueDateChange,
    onAddTag,
    onEditTitle,
    detailed,
    // Переміщення — лише в detailed-режимі (компактні картки скрізь
    // інде лишаються простим чекліст-пунктом, як і міні-теги/дедлайн).
    onMove: detailed && onReorder ? moveItem : undefined,
    onRemoved: (subtask) => {
      const index = items.indexOf(subtask);
      if (index !== -1) items.splice(index, 1);
      updateMoveButtons();
    },
  };

  items.forEach((subtask) => {
    list.appendChild(renderSubtaskItem(subtask, itemHandlers));
  });
  updateMoveButtons();

  const form = document.createElement("form");
  form.className = "subtask-add";
  form.noValidate = true;
  form.innerHTML = `
    <input
      type="text"
      class="subtask-add__input"
      placeholder="+ Підзадача"
      aria-label="Назва нової підзадачі"
    />
    <button type="submit" class="subtask-add__button">Додати</button>
  `;

  wrapper.appendChild(list);
  wrapper.appendChild(form);

  const input = form.querySelector(".subtask-add__input");
  const button = form.querySelector(".subtask-add__button");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = input.value.trim();
    if (!title || !onAdd) return;

    input.value = "";
    button.disabled = true;

    // Оптимістичний рядок — тимчасовий об'єкт-заглушка, поки база
    // не підтвердила збереження.
    const optimisticSubtask = { id: `temp-${Date.now()}`, title, completed: false, tags: [], due_date: null };
    const row = renderSubtaskItem(optimisticSubtask, itemHandlers);
    row.classList.add("subtask-item--pending");
    list.appendChild(row);
    items.push(optimisticSubtask);
    updateMoveButtons();

    try {
      const saved = await onAdd(title);
      // Той самий об'єкт лишається в замиканнях onToggle/onDelete/
      // onMove цього рядка — досить оновити id на справжній.
      optimisticSubtask.id = saved.id;
      row.classList.remove("subtask-item--pending");
    } catch (err) {
      console.error(err);
      row.remove();
      const index = items.indexOf(optimisticSubtask);
      if (index !== -1) items.splice(index, 1);
      updateMoveButtons();
      window.alert("Не вдалося додати підзадачу. Спробуйте ще раз.");
    } finally {
      button.disabled = false;
    }
  });

  return wrapper;
}
