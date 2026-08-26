// Сторінка «Історія» (/history) — задачі, автоматично перенесені
// сюди о 22:30 (pg_cron, 20260826030000_schedule_daily_archival.sql):
// виконані чи скасовані, list = "archive". Сама лише читає й показує
// (getArchivedTasks() один раз), звіт за період — фільтрація вже
// отриманого масиву на клієнті (для особистого використання обсяг
// не той, щоб виправдовувати окремий запит на кожну зміну періоду).

import { getArchivedTasks, restoreFromHistory } from "../store/taskStore.js";
import { renderHistoryList } from "../components/HistoryList.js";

const PRESETS = [
  { key: "all", label: "Увесь час" },
  { key: "week", label: "Поточний тиждень" },
  { key: "last-week", label: "Минулий тиждень" },
  { key: "month", label: "Цей місяць" },
];

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

// preset → { from: Date, to: Date } чи null для "весь час" (без меж).
function rangeOfPreset(preset) {
  const now = new Date();

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
  return null;
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

export async function renderHistory(root) {
  root.innerHTML = `
    <h1 class="page__title">Історія</h1>
    <div class="history-report">
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

  const presetButtons = root.querySelectorAll(".history-report__preset");
  const fromInput = root.querySelector(".history-report__from");
  const toInput = root.querySelector(".history-report__to");
  const summary = root.querySelector(".history-report__summary");
  const listSlot = root.querySelector(".history-list-slot");

  let allTasks = [];
  let activePreset = "all";

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
    const filtered = range
      ? allTasks.filter((task) => {
          const at = resolvedAtOf(task);
          if (range.from && at < range.from) return false;
          if (range.to && at > range.to) return false;
          return true;
        })
      : allTasks;

    const doneCount = filtered.filter((task) => task.completed).length;
    const cancelledCount = filtered.filter((task) => task.status === "cancelled").length;
    summary.textContent = `✅ Виконано: ${doneCount} · 🚫 Скасовано: ${cancelledCount}`;

    listSlot.replaceChildren(
      renderHistoryList(filtered, { onRestore: handleRestore }, "За цей період нічого нема.")
    );
  }

  async function loadAll() {
    try {
      allTasks = await getArchivedTasks();
    } catch (err) {
      console.error(err);
      allTasks = [];
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

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      fromInput.value = "";
      toInput.value = "";
      const range = rangeOfPreset(button.dataset.preset);
      if (range) {
        fromInput.value = toDateInputValue(range.from);
        toInput.value = toDateInputValue(range.to);
      }
      setActivePreset(button.dataset.preset);
      render();
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

  setActivePreset("all");
  await loadAll();
}
