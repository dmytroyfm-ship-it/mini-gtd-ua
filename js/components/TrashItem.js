// Один рядок кошика: назва задачі, нотатка (якщо є) й дві дії —
// «Відновити» та «Видалити назавжди». Сам нічого в базу не пише —
// викликає handlers.onRestore / handlers.onDeleteForever і показує
// результат (стан disabled). Логіка живе в js/store/taskStore.js
// (PROJECT_RULES, п.6).

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

export function renderTrashItem(task, handlers = {}) {
  const { onRestore, onDeleteForever } = handlers;

  const row = document.createElement("li");
  row.className = "trash-item";

  const noteHtml = task.note
    ? `<p class="trash-item__note">${escapeHtml(task.note)}</p>`
    : "";

  const safeTitle = escapeHtml(task.title);

  row.innerHTML = `
    <div class="trash-item__body">
      <p class="trash-item__title">${safeTitle}</p>
      ${noteHtml}
    </div>
    <div class="trash-item__actions">
      <button type="button" class="trash-item__restore">Відновити</button>
      <button type="button" class="trash-item__delete">Видалити назавжди</button>
    </div>
  `;

  const restoreButton = row.querySelector(".trash-item__restore");
  const deleteButton = row.querySelector(".trash-item__delete");

  function setBusy(busy) {
    restoreButton.disabled = busy;
    deleteButton.disabled = busy;
  }

  restoreButton.addEventListener("click", async () => {
    if (!onRestore) return;

    setBusy(true);
    try {
      await onRestore(task);
    } catch (err) {
      setBusy(false);
      window.alert(err instanceof Error ? err.message : "Не вдалося відновити задачу.");
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!onDeleteForever) return;

    const confirmed = window.confirm(
      `Остаточно видалити «${task.title}»? Цю дію не можна скасувати.`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await onDeleteForever(task);
    } catch (err) {
      setBusy(false);
      window.alert(err instanceof Error ? err.message : "Не вдалося видалити задачу.");
    }
  });

  return row;
}
