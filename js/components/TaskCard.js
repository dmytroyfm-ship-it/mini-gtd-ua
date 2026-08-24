// Повна картка задачі — «пульт керування»: назва, чекбокс
// «виконано», кошик, теги (+ додати), статус і список (dropdown —
// зміна списку одразу переносить задачу), дедлайн (date picker +
// очистити), підзадачі.
//
// Dropdown «Статус» керує тим самим полем status, що й колонки
// дошки /board (drag-and-drop) — це навмисно один і той самий
// dropdown-набір, синхронізований через єдине джерело правди в
// базі: зміна тут одразу відображається на дошці, і навпаки.
//
// Мутації самої задачі (тег/статус/список/дедлайн/виконано/кошик)
// віддаються нагору через handlers — той самий підхід, що вже є в
// pages/inbox.js (виклик функції стору → перемальовування списку).
// Підзадачі — виняток: керуються прямо тут, без перемальовування
// решти картки, бо не впливають на те, які задачі показані у
// списку (PROJECT_RULES, п.6 — бізнес-логіка в store, не тут).

import {
  getSubtasks,
  addSubtask,
  setSubtaskCompleted,
  setSubtaskDueDate,
  setSubtaskTags,
  deleteSubtask,
} from "../store/subtaskStore.js";
import { renderSubtaskList } from "./SubtaskList.js";

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

const TRASH_ICON_SVG = `
  <svg viewBox="0 0 20 20" aria-hidden="true" class="task-card__trash-icon">
    <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 9.4A1.5 1.5 0 0 0 7.6 17h4.8a1.5 1.5 0 0 0 1.5-1.6L14.5 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export function renderTaskCard(task, handlers = {}) {
  const {
    onToggleCompleted,
    onDelete,
    onStatusChange,
    onListChange,
    onDueDateChange,
    onAddTag,
    draggable,
    detail,
    detailedSubtasks,
  } = handlers;

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

  const safeTitle = escapeHtml(task.title);
  const tagsHtml = (task.tags || [])
    .map((tag) => `<li class="task-card__tag">${escapeHtml(tag)}</li>`)
    .join("");
  const noteHtml = task.note ? `<p class="task-card__note">${escapeHtml(task.note)}</p>` : "";

  card.innerHTML = `
    <div class="task-card__header">
      <input
        type="checkbox"
        class="task-card__checkbox"
        ${task.completed ? "checked" : ""}
        aria-label="Позначити «${safeTitle}» виконаною"
      />
      <h3 class="task-card__title">
        <a class="task-card__title-link" href="/task/${task.id}" data-link>${safeTitle}</a>
      </h3>
      <button type="button" class="task-card__trash" aria-label="Перемістити «${safeTitle}» в кошик">
        ${TRASH_ICON_SVG}
      </button>
    </div>

    ${noteHtml}

    <div class="task-card__tags">
      <ul class="task-card__tag-list">${tagsHtml}</ul>
      <button type="button" class="task-card__add-tag">+ тег</button>
    </div>

    <div class="task-card__controls">
      <label class="task-card__field">
        <span class="task-card__field-label">Статус</span>
        <select class="task-card__status">
          <option value="urgent">Термінові</option>
          <option value="not_urgent">Не термінові</option>
          <option value="daily">Щоденні</option>
          <option value="cancelled">Скасовані</option>
          <option value="waiting">В очікуванні</option>
        </select>
      </label>
      <label class="task-card__field">
        <span class="task-card__field-label">Список</span>
        <select class="task-card__list">
          <option value="inbox">Вхідні</option>
          <option value="next">Задачі</option>
          <option value="read_watch">Читати / Дивитись</option>
          <option value="someday">Колись</option>
          <option value="archive">Архів</option>
        </select>
      </label>
    </div>

    <div class="task-card__due">
      <span class="task-card__due-label">Дедлайн</span>
      <input type="date" class="task-card__due-input" value="${task.due_date || ""}" />
      <button type="button" class="task-card__due-clear" aria-label="Прибрати дедлайн" ${task.due_date ? "" : "hidden"}>✕</button>
    </div>

    <div class="task-card__subtasks">
      <p class="task-card__subtasks-title">Підзадачі</p>
      <p class="task-card__subtasks-loading">Завантаження…</p>
    </div>
  `;

  // Значення <select> виставляються властивістю, не HTML-атрибутом
  // на <option> — так гарантовано підсвічується поточна опція.
  card.querySelector(".task-card__status").value = task.status || "not_urgent";
  card.querySelector(".task-card__list").value = task.list;

  wireCompletedCheckbox(card, task, onToggleCompleted);
  wireTrashButton(card, task, onDelete);
  wireStatusSelect(card, task, onStatusChange);
  wireListSelect(card, task, onListChange);
  wireDueDate(card, task, onDueDateChange);
  wireAddTag(card, task, onAddTag);
  loadSubtasks(card, task, detailedSubtasks);

  return card;
}

function wireCompletedCheckbox(card, task, onToggleCompleted) {
  const checkbox = card.querySelector(".task-card__checkbox");

  checkbox.addEventListener("change", async () => {
    if (!onToggleCompleted) return;

    const next = checkbox.checked;
    checkbox.disabled = true;

    try {
      await onToggleCompleted(task, next);
    } catch (err) {
      console.error(err);
      checkbox.checked = !next;
      window.alert("Не вдалося оновити задачу. Спробуйте ще раз.");
    } finally {
      checkbox.disabled = false;
    }
  });
}

function wireTrashButton(card, task, onDelete) {
  const trashButton = card.querySelector(".task-card__trash");

  trashButton.addEventListener("click", async () => {
    if (!onDelete) return;

    trashButton.disabled = true;

    try {
      await onDelete(task);
    } catch (err) {
      console.error(err);
      trashButton.disabled = false;
      window.alert("Не вдалося видалити задачу. Спробуйте ще раз.");
    }
  });
}

function wireStatusSelect(card, task, onStatusChange) {
  const select = card.querySelector(".task-card__status");

  select.addEventListener("change", async () => {
    if (!onStatusChange) return;

    const value = select.value;
    select.disabled = true;

    try {
      await onStatusChange(task, value);
    } catch (err) {
      console.error(err);
      select.value = task.status || "not_urgent";
      window.alert("Не вдалося змінити статус. Спробуйте ще раз.");
    } finally {
      select.disabled = false;
    }
  });
}

function wireListSelect(card, task, onListChange) {
  const select = card.querySelector(".task-card__list");

  select.addEventListener("change", async () => {
    if (!onListChange) return;

    const value = select.value;
    select.disabled = true;

    try {
      await onListChange(task, value);
    } catch (err) {
      console.error(err);
      select.value = task.list;
      window.alert("Не вдалося перемістити задачу. Спробуйте ще раз.");
    } finally {
      select.disabled = false;
    }
  });
}

function wireDueDate(card, task, onDueDateChange) {
  const input = card.querySelector(".task-card__due-input");
  const clearButton = card.querySelector(".task-card__due-clear");

  async function commit(value) {
    if (!onDueDateChange) return;

    input.disabled = true;

    try {
      await onDueDateChange(task, value || null);
      clearButton.hidden = !value;
    } catch (err) {
      console.error(err);
      input.value = task.due_date || "";
      window.alert("Не вдалося зберегти дедлайн. Спробуйте ще раз.");
    } finally {
      input.disabled = false;
    }
  }

  input.addEventListener("change", () => commit(input.value));
  clearButton.addEventListener("click", () => {
    input.value = "";
    commit("");
  });
}

function wireAddTag(card, task, onAddTag) {
  const addButton = card.querySelector(".task-card__add-tag");

  addButton.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "task-card__tag-input";
    input.placeholder = "@тег";
    addButton.replaceWith(input);
    input.focus();

    let settled = false;

    function restore() {
      if (input.isConnected) input.replaceWith(addButton);
    }

    async function commit() {
      if (settled) return;
      settled = true;

      const value = input.value.trim();
      restore();
      if (!value || !onAddTag) return;

      try {
        await onAddTag(task, value);
      } catch (err) {
        console.error(err);
        window.alert("Не вдалося додати тег. Спробуйте ще раз.");
      }
    }

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        settled = true;
        restore();
      }
    });
    input.addEventListener("blur", commit);
  });
}

function loadSubtasks(card, task, detailedSubtasks) {
  const block = card.querySelector(".task-card__subtasks");
  const loading = block.querySelector(".task-card__subtasks-loading");

  getSubtasks(task.id)
    .then((subtasks) => {
      const list = renderSubtaskList(subtasks, {
        onToggle: (subtask, completed) => setSubtaskCompleted(subtask.id, completed),
        onDelete: (subtask) => deleteSubtask(subtask.id),
        onAdd: (title) => addSubtask(task.id, title),
        // Міні-дедлайн і міні-теги підзадачі — лише на сторінці
        // детального перегляду (detailedSubtasks); у компактних
        // картках («Вхідні», «Задачі», дошка) рядок підзадачі й
        // далі лишається простим чекліст-пунктом.
        onDueDateChange: detailedSubtasks
          ? (subtask, dueDate) => setSubtaskDueDate(subtask.id, dueDate)
          : undefined,
        onAddTag: detailedSubtasks
          ? (subtask, tag) => setSubtaskTags(subtask.id, [...(subtask.tags || []), tag])
          : undefined,
        detailed: detailedSubtasks,
      });
      loading.replaceWith(list);
    })
    .catch((err) => {
      console.error(err);
      loading.textContent = "Не вдалося завантажити підзадачі. Спробуйте оновити сторінку.";
    });
}
