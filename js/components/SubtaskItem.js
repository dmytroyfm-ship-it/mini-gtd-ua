// Один рядок підзадачі: круглий чекбокс + назва, кнопка видалення
// зʼявляється при наведенні. Сам нічого в базу не пише — викликає
// handlers.onToggle / handlers.onDelete. Логіка — в
// js/store/subtaskStore.js (PROJECT_RULES, п.6).

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

export function renderSubtaskItem(subtask, handlers = {}) {
  const { onToggle, onDelete } = handlers;

  const row = document.createElement("li");
  row.className = "subtask-item";
  if (subtask.completed) row.classList.add("subtask-item--completed");

  const safeTitle = escapeHtml(subtask.title);

  row.innerHTML = `
    <input
      type="checkbox"
      class="subtask-item__checkbox"
      ${subtask.completed ? "checked" : ""}
      aria-label="Позначити «${safeTitle}» виконаною"
    />
    <span class="subtask-item__title">${safeTitle}</span>
    <button type="button" class="subtask-item__delete" aria-label="Видалити підзадачу «${safeTitle}»">✕</button>
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

  return row;
}
