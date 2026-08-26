// Статус і список задачі — два dropdown у `.task-card__controls`.
// Dropdown «Статус» керує тим самим полем status, що й колонки
// дошки /board (drag-and-drop) — навмисно один і той самий
// dropdown-набір, синхронізований через єдине джерело правди в
// базі. «Виконані» серед пунктів — псевдо-опція ("done"), не
// справжнє значення status (task.completed — окреме булеве поле,
// галочка в TaskCardHeader.js); обробляється через
// taskStore.changeTaskStatus() (statusSelectValue() нижче показує
// її, коли задача виконана).
//
// Винесено з TaskCard.js (файл переріс 670+ рядків, поєднуючи п'ять
// незалежних блоків картки) — той самий принцип самодостатнього
// блоку, що вже є в SubtaskItem.js/MaterialsBlock.js.

function statusSelectValue(task) {
  return task.completed ? "done" : task.status || "not_urgent";
}

export function renderTaskCardMeta(task, handlers = {}) {
  const { onStatusChange, onListChange } = handlers;

  const wrapper = document.createElement("div");
  wrapper.className = "task-card__controls";
  wrapper.innerHTML = `
    <label class="task-card__field">
      <span class="task-card__field-label">Статус</span>
      <select class="task-card__status">
        <option value="urgent">Термінові</option>
        <option value="not_urgent">Не термінові</option>
        <option value="daily">Повторювані</option>
        <option value="waiting">В очікуванні</option>
        <option value="done">Виконані</option>
        <option value="cancelled">Скасовані</option>
      </select>
    </label>
    <label class="task-card__field">
      <span class="task-card__field-label">Список</span>
      <!-- Немає пункту "Історія" (list: archive) — туди задачі
           потрапляють лише автоматично, о 22:30, коли вже виконані
           чи скасовані (supabase/migrations/20260826030000_...).
           Ручний вибір дозволив би завісити задачу в архіві, не
           виконавши й не скасувавши її — HistoryItem.js тоді
           показав би її як "виконано", хоча це не так. -->
      <select class="task-card__list">
        <option value="inbox">Вхідні</option>
        <option value="next">Задачі</option>
        <option value="read_watch">Читати / Дивитись</option>
        <option value="someday">Колись</option>
      </select>
    </label>
  `;

  // Значення <select> виставляються властивістю, не HTML-атрибутом
  // на <option> — так гарантовано підсвічується поточна опція.
  wrapper.querySelector(".task-card__status").value = statusSelectValue(task);
  wrapper.querySelector(".task-card__list").value = task.list;

  wireStatusSelect(wrapper, task, onStatusChange);
  wireListSelect(wrapper, task, onListChange);

  return wrapper;
}

function wireStatusSelect(wrapper, task, onStatusChange) {
  const select = wrapper.querySelector(".task-card__status");

  select.addEventListener("change", async () => {
    if (!onStatusChange) return;

    const value = select.value;
    select.disabled = true;

    try {
      await onStatusChange(task, value);
    } catch (err) {
      console.error(err);
      select.value = statusSelectValue(task);
      window.alert("Не вдалося змінити статус. Спробуйте ще раз.");
    } finally {
      select.disabled = false;
    }
  });
}

function wireListSelect(wrapper, task, onListChange) {
  const select = wrapper.querySelector(".task-card__list");

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
