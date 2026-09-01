// Один рядок підзадачі: круглий чекбокс + назва, кнопка видалення
// зʼявляється при наведенні. У деталізованому режимі
// (handlers.detailed — вмикається лише на сторінці /task/:id)
// додатково показує власні міні-теги й міні-дедлайн підзадачі; у
// звичайному компактному режимі («Вхідні», «Задачі», дошка) —
// лишається простим чекліст-пунктом, як і раніше.
//
// Сам нічого в базу не пише — викликає handlers.onToggle /
// onDelete / onDueDateChange / onAddTag і показує результат (стан
// disabled, відкат при помилці). Логіка живе в
// js/store/subtaskStore.js (PROJECT_RULES, п.6).

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

const TRASH_SIGN = "✕";
const EDIT_SIGN = "✎";

export function renderSubtaskItem(subtask, handlers = {}) {
  const { onToggle, onDelete, onDueDateChange, onAddTag, onEditTitle, onMove, onRemoved, detailed } = handlers;

  const row = document.createElement("li");
  row.className = "subtask-item";
  if (detailed) row.classList.add("subtask-item--detailed");
  if (subtask.completed) row.classList.add("subtask-item--completed");

  const safeTitle = escapeHtml(subtask.title);

  const tagsHtml = detailed
    ? `
      <div class="subtask-item__tags">
        <ul class="subtask-item__tag-list">
          ${(subtask.tags || []).map((tag) => `<li class="subtask-item__tag">${escapeHtml(tag)}</li>`).join("")}
        </ul>
        <button type="button" class="subtask-item__add-tag">+ тег</button>
      </div>
    `
    : "";

  const dueHtml = detailed
    ? `
      <input
        type="date"
        class="subtask-item__due-input"
        value="${subtask.due_date || ""}"
        aria-label="Дедлайн підзадачі «${safeTitle}»"
      />
    `
    : "";

  // «↑»/«↓» — зміна порядку підзадач; лише коли handlers.onMove
  // задано (SubtaskList вмикає його лише в detailed-режимі).
  const moveHtml = onMove
    ? `
      <button type="button" class="subtask-item__move subtask-item__move--up" aria-label="Перемістити «${safeTitle}» вище">↑</button>
      <button type="button" class="subtask-item__move subtask-item__move--down" aria-label="Перемістити «${safeTitle}» нижче">↓</button>
    `
    : "";

  row.innerHTML = `
    <div class="subtask-item__main">
      <input
        type="checkbox"
        class="subtask-item__checkbox"
        ${subtask.completed ? "checked" : ""}
        aria-label="Позначити «${safeTitle}» виконаною"
      />
      <div class="subtask-item__body">
        <span class="subtask-item__title">${safeTitle}</span>
        ${tagsHtml}
      </div>
      ${dueHtml}
      ${moveHtml}
      <button type="button" class="subtask-item__edit" aria-label="Редагувати назву «${safeTitle}»">${EDIT_SIGN}</button>
      <button type="button" class="subtask-item__delete" aria-label="Видалити підзадачу «${safeTitle}»">${TRASH_SIGN}</button>
    </div>
  `;

  const checkbox = row.querySelector(".subtask-item__checkbox");
  const deleteButton = row.querySelector(".subtask-item__delete");

  if (onMove) {
    row.querySelector(".subtask-item__move--up").addEventListener("click", () => onMove(subtask, "up"));
    row.querySelector(".subtask-item__move--down").addEventListener("click", () => onMove(subtask, "down"));
  }

  checkbox.addEventListener("change", async () => {
    if (!onToggle) return;

    const next = checkbox.checked;
    checkbox.disabled = true;

    try {
      await onToggle(subtask, next);
      subtask.completed = next;
      row.classList.toggle("subtask-item--completed", next);
    } catch (err) {
      console.error(err);
      checkbox.checked = !next;
      window.alert("Не вдалося оновити підзадачу. Спробуйте ще раз.");
    } finally {
      checkbox.disabled = false;
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!onDelete) return;

    deleteButton.disabled = true;

    try {
      await onDelete(subtask);
      row.remove();
      // Даємо SubtaskList прибрати підзадачу зі своєї робочої копії
      // й перерахувати край списку для кнопок «↑»/«↓».
      if (onRemoved) onRemoved(subtask);
    } catch (err) {
      console.error(err);
      deleteButton.disabled = false;
      window.alert("Не вдалося видалити підзадачу. Спробуйте ще раз.");
    }
  });

  wireSubtaskEditTitle(row, subtask, onEditTitle);

  if (detailed) {
    wireSubtaskDueDate(row, subtask, onDueDateChange);
    wireSubtaskAddTag(row, subtask, onAddTag);
  }

  return row;
}

// Розтягує textarea назви по висоті під фактичний вміст — той самий
// прийом, що й autoGrowTitle() у TaskCard.js (однорядковий <input>
// на довгій назві + input.select() показував лише хвіст тексту біля
// курсора, ховаючи початок).
function autoGrow(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

// Клік по «✎» — рядок .subtask-item__title міняється на текстове
// поле, зберігає і по Enter, і по blur (звичайний клік повз поле не
// мав би скасовувати введене — той самий принцип, що й у
// AccountMenu.js), Escape — єдиний спосіб явно скасувати.
function wireSubtaskEditTitle(row, subtask, onEditTitle) {
  const editButton = row.querySelector(".subtask-item__edit");

  editButton.addEventListener("click", () => {
    const titleSpan = row.querySelector(".subtask-item__title");
    if (!titleSpan) return; // вже редагується

    const originalText = titleSpan.textContent;

    // <textarea>, не <input>: на довгій назві однорядкове поле разом
    // з input.select() показувало лише хвіст тексту біля курсора
    // (початок ховався за прокруткою) — textarea переносить рядки й
    // росте по висоті через autoGrow(), тож видно весь текст одразу.
    const input = document.createElement("textarea");
    input.rows = 1;
    input.className = "subtask-item__title-input";
    input.value = originalText;
    titleSpan.replaceWith(input);
    autoGrow(input);
    input.addEventListener("input", () => autoGrow(input));
    input.focus();
    input.select();

    let cancelled = false;
    let saving = false;

    function renderText(text) {
      const span = document.createElement("span");
      span.className = "subtask-item__title";
      span.textContent = text;
      input.replaceWith(span);
    }

    async function save() {
      if (saving) return;
      saving = true;

      const nextTitle = input.value.trim();
      if (!nextTitle || nextTitle === originalText || !onEditTitle) {
        renderText(originalText);
        return;
      }

      input.disabled = true; // сам по собі викликає blur — saving-прапорець захищає від повторного save()

      try {
        await onEditTitle(subtask, nextTitle);
        subtask.title = nextTitle;
        renderText(nextTitle);
      } catch (err) {
        console.error(err);
        window.alert("Не вдалося зберегти назву підзадачі. Спробуйте ще раз.");
        renderText(originalText);
      }
    }

    input.addEventListener("blur", () => {
      if (!cancelled) save();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      } else if (event.key === "Escape") {
        cancelled = true;
        renderText(originalText);
      }
    });
  });
}

function wireSubtaskDueDate(row, subtask, onDueDateChange) {
  const input = row.querySelector(".subtask-item__due-input");

  input.addEventListener("change", async () => {
    if (!onDueDateChange) return;

    const value = input.value;
    input.disabled = true;

    try {
      await onDueDateChange(subtask, value || null);
      subtask.due_date = value || null;
    } catch (err) {
      console.error(err);
      input.value = subtask.due_date || "";
      window.alert("Не вдалося зберегти дедлайн підзадачі. Спробуйте ще раз.");
    } finally {
      input.disabled = false;
    }
  });
}

function wireSubtaskAddTag(row, subtask, onAddTag) {
  const addButton = row.querySelector(".subtask-item__add-tag");
  const tagList = row.querySelector(".subtask-item__tag-list");

  addButton.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "subtask-item__tag-input";
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
        await onAddTag(subtask, value);
        subtask.tags = [...(subtask.tags || []), value];
        const tagEl = document.createElement("li");
        tagEl.className = "subtask-item__tag";
        tagEl.textContent = value;
        tagList.appendChild(tagEl);
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
