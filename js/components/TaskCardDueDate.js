// Дедлайн, необов'язковий період («Початок періоду», лише weekly/
// monthly), повторення й «⏭ Пропустити» — усе під `.task-card__due`.
// Винесено з TaskCard.js (файл переріс 670+ рядків, поєднуючи п'ять
// незалежних блоків картки) — той самий принцип самодостатнього
// блоку, що вже є в SubtaskItem.js/MaterialsBlock.js.

// Date → "YYYY-MM-DD" за МІСЦЕВИМИ полями (getFullYear/getMonth/
// getDate), не toISOString() (той завжди повертає UTC): дата вище
// побудована як опівніч за МІСЦЕВИМ часом (new Date(`${...}T00:00:00`)
// без "Z" — так параситься за специфікацією), і toISOString() у
// таймзоні з позитивним зсувом (Київ, UTC+2/+3) відкочував би її на
// день назад (опівніч 1 вересня за Києвом — це 31 серпня ~21:00 UTC).
function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Період дедлайну зберігається як довжина в днях ДО due_date
// (recurrence_window_days) — тут рахуємо назад саму дату початку
// для date-picker'а «Початок періоду».
function windowStartOf(task) {
  // task.recurrence_window_days == null (не !task.recurrence_window_days!)
  // — 0 сам по собі валідне значення (період "той самий день", коли
  // початок і дедлайн збігаються), а не "періоду нема"; !0 дало б
  // true й ховало щойно введений початок, показуючи порожнє поле.
  if (!task.due_date || task.recurrence_window_days == null) return "";
  const start = new Date(`${task.due_date}T00:00:00`);
  start.setDate(start.getDate() - task.recurrence_window_days);
  return toLocalDateString(start);
}

export function renderTaskCardDueDate(task, handlers = {}) {
  const { onDueDateChange, onRecurrenceChange, onRecurrenceWindowChange, onSkipTask } = handlers;

  // Період показуємо лише для weekly/monthly — для "щодня" й "не
  // повторюється" (де recurrence_window_days ігнорується скрізь
  // нижче) поле початку періоду просто ховається.
  const showWindow = task.recurrence === "weekly" || task.recurrence === "monthly";
  const windowStartValue = windowStartOf(task);

  const wrapper = document.createElement("div");
  wrapper.className = "task-card__due";
  wrapper.innerHTML = `
    <span class="task-card__due-label">Дедлайн</span>
    <input
      type="date"
      class="task-card__due-window-start"
      aria-label="Початок періоду (необов'язково)"
      value="${windowStartValue}"
      ${showWindow ? "" : "hidden"}
    />
    <span class="task-card__due-range-arrow" ${showWindow ? "" : "hidden"}>→</span>
    <input type="date" class="task-card__due-input" value="${task.due_date || ""}" />
    <button type="button" class="task-card__due-clear" aria-label="Прибрати дедлайн" ${task.due_date ? "" : "hidden"}>✕</button>
    <select class="task-card__recurrence" aria-label="Повторення">
      <option value="">Не повторюється</option>
      <option value="daily">Щодня</option>
      <option value="weekly">Щотижня</option>
      <option value="monthly">Щомісяця</option>
    </select>
    <button
      type="button"
      class="task-card__skip-recurrence"
      title="Цього разу нічого не сталось (наприклад, подію скасували) — перенести на наступний цикл, не позначаючи виконаною"
      ${task.recurrence ? "" : "hidden"}
    >⏭ Пропустити</button>
  `;

  wrapper.querySelector(".task-card__recurrence").value = task.recurrence || "";

  wireDueDate(wrapper, task, onDueDateChange);
  wireRecurrence(wrapper, task, onRecurrenceChange);
  wireRecurrenceWindow(wrapper, task, onRecurrenceWindowChange);
  wireSkipTask(wrapper, task, onSkipTask);

  return wrapper;
}

function wireDueDate(wrapper, task, onDueDateChange) {
  const input = wrapper.querySelector(".task-card__due-input");
  const clearButton = wrapper.querySelector(".task-card__due-clear");

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

function wireRecurrence(wrapper, task, onRecurrenceChange) {
  const select = wrapper.querySelector(".task-card__recurrence");

  select.addEventListener("change", async () => {
    if (!onRecurrenceChange) return;

    const value = select.value || null;
    select.disabled = true;

    try {
      await onRecurrenceChange(task, value);
      task.recurrence = value;
    } catch (err) {
      console.error(err);
      select.value = task.recurrence || "";
      window.alert("Не вдалося зберегти повторення. Спробуйте ще раз.");
    } finally {
      select.disabled = false;
    }
  });
}

// Поле «Початок періоду» — необов'язкове; має сенс лише для
// weekly/monthly (renderTaskCardDueDate ховає його інакше). Зберігає
// не саму дату, а довжину періоду в днях ДО дедлайну
// (recurrence_window_days) — так наступний цикл повторення сам
// зсуває обидві межі періоду на однакову відстань (completeTask()
// в taskStore.js), без окремого перерахунку тут.
function wireRecurrenceWindow(wrapper, task, onRecurrenceWindowChange) {
  const startInput = wrapper.querySelector(".task-card__due-window-start");
  const dueInput = wrapper.querySelector(".task-card__due-input");

  startInput.addEventListener("change", async () => {
    if (!onRecurrenceWindowChange) return;

    if (!dueInput.value) {
      window.alert("Спершу вкажіть дедлайн (кінець періоду) — тоді можна задати початок.");
      startInput.value = "";
      return;
    }

    let windowDays = null;
    if (startInput.value) {
      const days = Math.round((new Date(dueInput.value) - new Date(startInput.value)) / 86400000);
      if (days < 0) {
        window.alert("Початок періоду не може бути пізніше за дедлайн.");
        startInput.value = windowStartOf(task);
        return;
      }
      windowDays = days;
    }

    startInput.disabled = true;

    try {
      await onRecurrenceWindowChange(task, windowDays);
      task.recurrence_window_days = windowDays;
    } catch (err) {
      console.error(err);
      startInput.value = windowStartOf(task);
      window.alert("Не вдалося зберегти період. Спробуйте ще раз.");
    } finally {
      startInput.disabled = false;
    }
  });
}

// «⏭ Пропустити» — видима лише для повторюваних задач
// (renderTaskCardDueDate ховає її інакше). На відміну від чекбокса
// «виконано» не позначає completed і не створює нового рядка
// історії — просто переносить due_date цієї ж задачі на наступний
// цикл (taskStore.skipTask()). Підтвердження через window.confirm()
// — дію неможливо скасувати (попередній дедлайн ніде не
// зберігається), той самий принцип, що й у TrashItem.js/
// IntegrationsCard.js для інших дій без відкату.
function wireSkipTask(wrapper, task, onSkipTask) {
  const button = wrapper.querySelector(".task-card__skip-recurrence");

  button.addEventListener("click", async () => {
    if (!onSkipTask) return;
    if (!window.confirm("Пропустити цей цикл і перенести дедлайн на наступний, не позначаючи задачу виконаною?")) return;

    button.disabled = true;

    try {
      await onSkipTask(task);
    } catch (err) {
      console.error(err);
      button.disabled = false;
      window.alert("Не вдалося пропустити цикл. Спробуйте ще раз.");
    }
  });
}
