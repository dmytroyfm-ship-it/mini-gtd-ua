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

export function renderSubtaskItem(subtask, handlers = {}) {
  const { onToggle, onDelete, onDueDateChange, onAddTag, detailed } = handlers;

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
      <button type="button" class="subtask-item__delete" aria-label="Видалити підзадачу «${safeTitle}»">${TRASH_SIGN}</button>
    </div>
  `;

  const checkbox = row.querySelector(".subtask-item__checkbox");
  const deleteButton = row.querySelector(".subtask-item__delete");

  checkbox.addEventListener("change", async () => {
    if (!onToggle) return;

    const next = checkbox.checked;
    checkbox.disabled = true;

    try {
      await onToggle(subtask, next);
      subtask.completed = next;
      row.classList.toggle("subtask-item--completed", next);
    } catch (err) {
      checkbox.checked = !next;
      window.alert(err?.message || "Не вдалося оновити підзадачу.");
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
    } catch (err) {
      deleteButton.disabled = false;
      window.alert(err?.message || "Не вдалося видалити підзадачу.");
    }
  });

  if (detailed) {
    wireSubtaskDueDate(row, subtask, onDueDateChange);
    wireSubtaskAddTag(row, subtask, onAddTag);
  }

  return row;
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
      input.value = subtask.due_date || "";
      window.alert(err?.message || "Не вдалося зберегти дедлайн підзадачі.");
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
        window.alert(err?.message || "Не вдалося додати тег.");
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
