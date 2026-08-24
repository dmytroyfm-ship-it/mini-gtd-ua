// Один рядок задачі: чекбокс «виконано», назва, нотатка (якщо є),
// теги й кнопка «в кошик». Сам нічого в базу не пише — викликає
// handlers.onToggle / handlers.onDelete і показує результат (стан
// disabled, відкат чекбокса при помилці). Логіка збереження живе в
// js/store/taskStore.js (PROJECT_RULES, п.6).

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

const TRASH_ICON_SVG = `
  <svg class="task-item__delete-icon" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 9.4A1.5 1.5 0 0 0 7.6 17h4.8a1.5 1.5 0 0 0 1.5-1.6L14.5 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export function renderTaskItem(task, handlers = {}) {
  const { onToggle, onDelete } = handlers;

  const row = document.createElement("li");
  row.className = "task-item";
  if (task.completed) row.classList.add("task-item--completed");

  const noteHtml = task.note
    ? `<p class="task-item__note">${escapeHtml(task.note)}</p>`
    : "";

  const tagsHtml = task.tags && task.tags.length
    ? `
      <ul class="task-item__tags">
        ${task.tags.map((tag) => `<li class="task-item__tag">${escapeHtml(tag)}</li>`).join("")}
      </ul>
    `
    : "";

  const safeTitle = escapeHtml(task.title);

  row.innerHTML = `
    <input
      type="checkbox"
      class="task-item__checkbox"
      ${task.completed ? "checked" : ""}
      aria-label="Позначити «${safeTitle}» виконаною"
    />
    <div class="task-item__body">
      <p class="task-item__title">${safeTitle}</p>
      ${noteHtml}
    </div>
    ${tagsHtml}
    <button type="button" class="task-item__delete" aria-label="Перемістити «${safeTitle}» в кошик">
      ${TRASH_ICON_SVG}
    </button>
  `;

  const checkbox = row.querySelector(".task-item__checkbox");
  const deleteButton = row.querySelector(".task-item__delete");

  checkbox.addEventListener("change", async () => {
    if (!onToggle) return;

    const nextCompleted = checkbox.checked;
    checkbox.disabled = true;

    try {
      await onToggle(task, nextCompleted);
    } catch (err) {
      checkbox.checked = !nextCompleted;
      checkbox.disabled = false;
      window.alert(err instanceof Error ? err.message : "Не вдалося оновити задачу.");
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!onDelete) return;

    deleteButton.disabled = true;

    try {
      await onDelete(task);
    } catch (err) {
      deleteButton.disabled = false;
      window.alert(err instanceof Error ? err.message : "Не вдалося видалити задачу.");
    }
  });

  return row;
}
