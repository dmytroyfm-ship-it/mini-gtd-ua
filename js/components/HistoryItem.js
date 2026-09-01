// Один рядок «Історії»: назва задачі, нотатка (якщо є), розклад
// підзадач (якщо є — які виконані, які ні), позначка
// «✅ Виконано» / «🚫 Скасовано» / «📁 В архіві» з датою — і кнопка
// «Повернути у Вхідні» для всього, крім справді виконаного (виконані
// повертати нема сенсу: щоб зробити задачу знову активною, простіше
// зняти позначку «виконано» прямо на сторінці задачі). Сам нічого в
// базу не пише — викликає handlers.onRestore і показує результат
// (стан disabled). Логіка живе в js/store/taskStore.js
// (PROJECT_RULES, п.6). Підзадачі тут — лише для огляду, без
// чекбоксів: «Історія» це звіт, а не робочий екран (редагувати
// підзадачі можна на сторінці задачі /task/:id).

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

// "2026-08-25T14:03:00Z" → "25.08.2026" — компактна дата без часу,
// той самий формат, що вже звичний по проєкту (formatDueDate у
// daily-reminder тощо).
function formatDate(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

// completed=true — єдиний однозначний випадок "справді зроблено".
// Усе інше (status "cancelled", чи навіть старі задачі, занесені
// сюди ще вручну до автоперенесення — ні виконані, ні скасовані)
// повертається кнопкою "Повернути у Вхідні": показувати їх як
// "виконано" було б неправдою.
function badgeOf(task) {
  if (task.completed) return { cls: "completed", text: "✅ Виконано" };
  if (task.status === "cancelled") return { cls: "cancelled", text: "🚫 Скасовано" };
  return { cls: "neutral", text: "📁 В архіві" };
}

// Розклад підзадач під рядком: скільки виконано з усіх + сам список
// (виконані — з позначкою й закреслені, решта — з порожнім кружком).
// Порожньо, коли підзадач нема — секція взагалі не малюється.
function renderSubtasks(subtasks) {
  if (!subtasks || subtasks.length === 0) return "";

  const doneCount = subtasks.filter((subtask) => subtask.completed).length;
  const items = subtasks
    .map((subtask) => {
      const done = Boolean(subtask.completed);
      const marker = done ? "✓" : "○";
      return `<li class="history-item__subtask${done ? " history-item__subtask--done" : ""}">
        <span class="history-item__subtask-marker" aria-hidden="true">${marker}</span>
        <span class="history-item__subtask-title">${escapeHtml(subtask.title)}</span>
      </li>`;
    })
    .join("");

  return `
    <div class="history-item__subtasks">
      <p class="history-item__subtasks-label">Підзадачі · ${doneCount} / ${subtasks.length} виконано</p>
      <ul class="history-item__subtask-list">${items}</ul>
    </div>
  `;
}

export function renderHistoryItem(task, handlers = {}, subtasks = []) {
  const { onRestore } = handlers;

  const row = document.createElement("li");
  row.className = "history-item";

  const badge = badgeOf(task);
  const isRestorable = !task.completed;
  const resolvedAt = task.completed_at || task.cancelled_at || task.updated_at;

  const noteHtml = task.note ? `<p class="history-item__note">${escapeHtml(task.note)}</p>` : "";
  const subtasksHtml = renderSubtasks(subtasks);
  const safeTitle = escapeHtml(task.title);

  // Кнопка (коли є) — перед бейджем, бейдж завжди останній
  // (крайній праворуч, фіксованої ширини — css/history.css) — щоб
  // рядки з кнопкою й без неї однаково вирівнювались по правому краю.
  row.innerHTML = `
    <div class="history-item__body">
      <p class="history-item__title">${safeTitle}</p>
      ${noteHtml}
      ${subtasksHtml}
    </div>
    ${isRestorable ? `<button type="button" class="history-item__restore">Повернути у Вхідні</button>` : ""}
    <span class="history-item__badge history-item__badge--${badge.cls}">${badge.text} · ${formatDate(resolvedAt)}</span>
  `;

  if (isRestorable) {
    const restoreButton = row.querySelector(".history-item__restore");
    restoreButton.addEventListener("click", async () => {
      if (!onRestore) return;

      restoreButton.disabled = true;

      try {
        await onRestore(task);
      } catch (err) {
        console.error(err);
        restoreButton.disabled = false;
        window.alert("Не вдалося повернути задачу. Спробуйте ще раз.");
      }
    });
  }

  return row;
}
