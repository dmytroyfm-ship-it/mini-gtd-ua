// Один рядок «Історії»: назва задачі, нотатка (якщо є), позначка
// «✅ Виконано» / «🚫 Скасовано» / «📁 В архіві» з датою — і кнопка
// «Повернути у Вхідні» для всього, крім справді виконаного (виконані
// повертати нема сенсу: щоб зробити задачу знову активною, простіше
// зняти позначку «виконано» прямо на сторінці задачі). Сам нічого в
// базу не пише — викликає handlers.onRestore і показує результат
// (стан disabled). Логіка живе в js/store/taskStore.js
// (PROJECT_RULES, п.6).

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

export function renderHistoryItem(task, handlers = {}) {
  const { onRestore } = handlers;

  const row = document.createElement("li");
  row.className = "history-item";

  const badge = badgeOf(task);
  const isRestorable = !task.completed;
  const resolvedAt = task.completed_at || task.cancelled_at || task.updated_at;

  const noteHtml = task.note ? `<p class="history-item__note">${escapeHtml(task.note)}</p>` : "";
  const safeTitle = escapeHtml(task.title);

  // Кнопка (коли є) — перед бейджем, бейдж завжди останній
  // (крайній праворуч, фіксованої ширини — css/history.css) — щоб
  // рядки з кнопкою й без неї однаково вирівнювались по правому краю.
  row.innerHTML = `
    <div class="history-item__body">
      <p class="history-item__title">${safeTitle}</p>
      ${noteHtml}
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
