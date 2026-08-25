// Список підзадач: рядки + форма «+ Підзадача» внизу.
//
// Додавання — оптимістичне (Optimistic UI): рядок з'являється в
// списку одразу, ще до відповіді бази. Якщо збереження вдалось —
// тимчасовий id рядка тихо замінюється на справжній (щоб подальші
// відмітка/видалення працювали коректно). Якщо ні — рядок
// прибирається і показується помилка.

import { renderSubtaskItem } from "./SubtaskItem.js";

export function renderSubtaskList(subtasks, handlers = {}) {
  const { onToggle, onDelete, onAdd, onDueDateChange, onAddTag, onEditTitle, detailed } = handlers;
  const itemHandlers = { onToggle, onDelete, onDueDateChange, onAddTag, onEditTitle, detailed };

  const wrapper = document.createElement("div");
  wrapper.className = "subtask-list-block";

  const list = document.createElement("ul");
  list.className = "subtask-list";
  subtasks.forEach((subtask) => {
    list.appendChild(renderSubtaskItem(subtask, itemHandlers));
  });

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

    try {
      const saved = await onAdd(title);
      // Той самий об'єкт лишається в замиканнях onToggle/onDelete
      // цього рядка — досить оновити id на справжній.
      optimisticSubtask.id = saved.id;
      row.classList.remove("subtask-item--pending");
    } catch (err) {
      console.error(err);
      row.remove();
      window.alert("Не вдалося додати підзадачу. Спробуйте ще раз.");
    } finally {
      button.disabled = false;
    }
  });

  return wrapper;
}
