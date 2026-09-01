// Сторінка «Історія» (/history).
//
// Два режими (перемикач «Усі» / «Тільки завершені», вибір
// запам'ятовується в localStorage):
//   • «Тільки завершені» — виконані чи скасовані задачі
//     (getArchivedTasks() у taskStore.js — completed/cancelled,
//     незалежно від нічного автоперенесення о 22:30, pg_cron,
//     20260826030000_schedule_daily_archival.sql). Це «журнал
//     завершеного», фільтрується за періодом.
//   • «Усі» — додатково показує АКТИВНІ задачі, у яких є хоч одна
//     виконана підзадача (getActiveTasksWithDoneSubtasks()) — щоб
//     бачити прогрес по незавершених («що я вже зробив, що лишилось»).
//     Ці рядки не залежать від вибраного періоду (це поточний стан,
//     не подія в минулому) і йдуть зверху списку.
//
// Сама лише читає й показує; звіт за період — фільтрація вже
// отриманого масиву на клієнті (для особистого використання обсяг
// не той, щоб виправдовувати окремий запит на кожну зміну періоду).

import {
  getArchivedTasks,
  getActiveTasksWithDoneSubtasks,
  restoreFromHistory,
} from "../store/taskStore.js";
import { getSubtasksByTaskIds } from "../store/subtaskStore.js";
import { renderHistoryList } from "../components/HistoryList.js";

const PRESETS = [
  { key: "today", label: "Сьогодні" },
  { key: "week", label: "Поточний тиждень" },
  { key: "last-week", label: "Минулий тиждень" },
  { key: "month", label: "Поточний місяць" },
  { key: "last-month", label: "Минулий місяць" },
  { key: "range", label: "Діапазон дат" },
];

// Режим списку — «done» (лише завершені, за замовчуванням: зберігає
// звичний сенс «Історії») чи «all» (+ активні з прогресом підзадач).
// Вибір у localStorage, не в БД — суто уподобання перегляду, той
// самий підхід, що й у теми (js/store/themeStore.js).
const SCOPE_KEY = "mini-gtd-history-scope";

function loadScope() {
  try {
    return localStorage.getItem(SCOPE_KEY) === "all" ? "all" : "done";
  } catch (e) {
    return "done";
  }
}

function saveScope(scope) {
  try {
    localStorage.setItem(SCOPE_KEY, scope);
  } catch (e) {
    /* приватний режим тощо — не критично */
  }
}

// Понеділок тижня, що містить date (getDay(): 0=нд..6=сб).
function mondayOf(date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfWeek(monday) {
  const result = new Date(monday);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}

// preset → { from: Date, to: Date } чи { empty: true } для "Діапазон
// дат" (і будь-якого незрозумілого пресету — напр. після ручного
// очищення обох полів дат без активного пресету): нічого не
// показувати, поки не вказано хоч одну дату вручну нижче. Раніше тут
// була "Увесь час" (null = без меж, показати геть усе одразу) —
// прибрано на прохання користувача: бачити ВСІ задачі без жодного
// фільтра було зайвим.
function rangeOfPreset(preset) {
  const now = new Date();

  if (preset === "today") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (preset === "week") {
    const from = mondayOf(now);
    return { from, to: endOfWeek(from) };
  }
  if (preset === "last-week") {
    const from = mondayOf(now);
    from.setDate(from.getDate() - 7);
    return { from, to: endOfWeek(from) };
  }
  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
  // new Date(year, -1, ...) сама коректно переносить на грудень
  // попереднього року — той самий трюк, що вже є в "month" вище
  // (day: 0 наступного місяця = останній день поточного).
  if (preset === "last-month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  return { empty: true };
}

// "2026-08-25" (з <input type="date">) → початок/кінець того дня
// локально — узгоджено з тим, як рахуються пресети вище.
function dateInputToRange(fromValue, toValue) {
  const from = fromValue ? new Date(`${fromValue}T00:00:00`) : null;
  const to = toValue ? new Date(`${toValue}T23:59:59.999`) : null;
  if (!from && !to) return null;
  return { from, to };
}

function toDateInputValue(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolvedAtOf(task) {
  return new Date(task.completed_at || task.cancelled_at || task.updated_at);
}

// Активна задача, показана лише заради прогресу підзадач (режим
// «Усі») — той самий критерій, що й у HistoryItem.isInProgress().
function isInProgress(task) {
  return !task.completed && task.status !== "cancelled" && task.list !== "archive";
}

export async function renderHistory(root) {
  root.innerHTML = `
    <h1 class="page__title">Історія</h1>
    <div class="history-report">
      <div class="history-report__scope">
        <button type="button" class="history-report__scope-btn" data-scope="all">Усі</button>
        <button type="button" class="history-report__scope-btn" data-scope="done">Тільки завершені</button>
      </div>
      <div class="history-report__presets">
        ${PRESETS.map(
          (p) => `<button type="button" class="history-report__preset" data-preset="${p.key}">${p.label}</button>`
        ).join("")}
      </div>
      <div class="history-report__custom">
        <label class="history-report__custom-field">
          З
          <input type="date" class="history-report__from" />
        </label>
        <label class="history-report__custom-field">
          По
          <input type="date" class="history-report__to" />
        </label>
      </div>
      <p class="history-report__summary"></p>
    </div>
    <div class="history-list-slot"><p class="page__text">Завантаження…</p></div>
  `;

  const scopeButtons = root.querySelectorAll(".history-report__scope-btn");
  const presetButtons = root.querySelectorAll(".history-report__preset");
  const fromInput = root.querySelector(".history-report__from");
  const toInput = root.querySelector(".history-report__to");
  const summary = root.querySelector(".history-report__summary");
  const listSlot = root.querySelector(".history-list-slot");

  let doneTasks = []; // завершені/скасовані/архів
  let activeTasks = []; // активні з прогресом підзадач (лише режим "all")
  let subtasksByTask = new Map();
  let scope = loadScope();
  let activePreset = "today";

  function setActiveScope(next) {
    scope = next;
    saveScope(next);
    scopeButtons.forEach((button) => {
      button.classList.toggle("history-report__scope-btn--active", button.dataset.scope === next);
    });
  }

  function setActivePreset(preset) {
    activePreset = preset;
    presetButtons.forEach((button) => {
      button.classList.toggle("history-report__preset--active", button.dataset.preset === preset);
    });
  }

  function currentRange() {
    if (fromInput.value || toInput.value) return dateInputToRange(fromInput.value, toInput.value);
    return rangeOfPreset(activePreset);
  }

  function render() {
    const range = currentRange();
    const filteredDone = range.empty
      ? []
      : doneTasks.filter((task) => {
          const at = resolvedAtOf(task);
          if (range.from && at < range.from) return false;
          if (range.to && at > range.to) return false;
          return true;
        });

    // Активні задачі — завжди зверху, без фільтра за періодом (це
    // поточний стан роботи, а не подія в конкретному дні).
    const rows = [...activeTasks, ...filteredDone];

    const doneCount = filteredDone.filter((task) => task.completed).length;
    const cancelledCount = filteredDone.filter((task) => task.status === "cancelled").length;
    const parts = [`✅ Виконано: ${doneCount}`, `🚫 Скасовано: ${cancelledCount}`];
    if (scope === "all") parts.push(`🔵 В роботі: ${activeTasks.length}`);
    summary.textContent = parts.join(" · ");

    let emptyText;
    if (rows.length === 0) {
      emptyText = range.empty
        ? "Вкажіть дати «З» і/або «По» вище, щоб побачити задачі за проміжок."
        : scope === "all"
          ? "Нічого нема: ні завершених за цей період, ні активних задач із виконаними підзадачами."
          : "За цей період нічого нема.";
    }

    listSlot.replaceChildren(renderHistoryList(rows, { onRestore: handleRestore }, emptyText, subtasksByTask));
  }

  async function loadAll() {
    try {
      const [archived, active] = await Promise.all([
        getArchivedTasks(),
        scope === "all" ? getActiveTasksWithDoneSubtasks() : Promise.resolve([]),
      ]);
      doneTasks = archived;
      activeTasks = active;
      const allIds = [...doneTasks, ...activeTasks].map((task) => task.id);
      subtasksByTask = await getSubtasksByTaskIds(allIds);
    } catch (err) {
      console.error(err);
      doneTasks = [];
      activeTasks = [];
      subtasksByTask = new Map();
      listSlot.innerHTML = "";
      const error = document.createElement("p");
      error.className = "page__text";
      error.textContent = "Не вдалося завантажити історію. Спробуйте оновити сторінку.";
      listSlot.appendChild(error);
      return;
    }

    render();
  }

  async function handleRestore(task) {
    await restoreFromHistory(task.id);
    await loadAll();
  }

  scopeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.scope === scope) return;
      setActiveScope(button.dataset.scope);
      listSlot.replaceChildren(Object.assign(document.createElement("p"), {
        className: "page__text",
        textContent: "Завантаження…",
      }));
      loadAll();
    });
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const range = rangeOfPreset(button.dataset.preset);
      fromInput.value = toDateInputValue(range.from);
      toInput.value = toDateInputValue(range.to);
      setActivePreset(button.dataset.preset);
      render();
      // «Діапазон дат» сам по собі нічого не показує (empty: true) —
      // одразу переносимо фокус у перше поле дати, щоб не змушувати
      // клікати ще раз.
      if (button.dataset.preset === "range") fromInput.focus();
    });
  });

  fromInput.addEventListener("change", () => {
    setActivePreset(null);
    render();
  });
  toInput.addEventListener("change", () => {
    setActivePreset(null);
    render();
  });

  setActiveScope(scope);
  setActivePreset("today");
  await loadAll();
}
