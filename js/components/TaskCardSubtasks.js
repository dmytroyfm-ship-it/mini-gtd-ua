// Блок «Підзадачі» (`.task-card__subtasks`) — «✨ Розбити на кроки»
// + сам список (SubtaskList.js/subtaskStore.js). Самодостатній: сам
// вантажить і перемальовує лише свій вміст, без перемальовування
// решти картки — той самий принцип, що й MaterialsBlock.js/
// CommentsBlock.js на /task/:id.
//
// Винесено з TaskCard.js (файл переріс 670+ рядків, поєднуючи п'ять
// незалежних блоків картки).

import {
  getSubtasks,
  addSubtask,
  setSubtaskCompleted,
  setSubtaskDueDate,
  setSubtaskTags,
  setSubtaskTitle,
  setSubtaskPositions,
  deleteSubtask,
} from "../store/subtaskStore.js";
import { breakdownTaskWithAI } from "../store/aiStore.js";
import { renderSubtaskList } from "./SubtaskList.js";

export function renderTaskCardSubtasks(task, handlers = {}) {
  const { detailedSubtasks } = handlers;

  const wrapper = document.createElement("div");
  wrapper.className = "task-card__subtasks";
  wrapper.innerHTML = `
    <div class="task-card__subtasks-header">
      <p class="task-card__subtasks-title">Підзадачі</p>
      <button type="button" class="task-card__ai-breakdown">✨ Розбити на кроки</button>
    </div>
    <div class="task-card__subtasks-content">
      <p class="task-card__subtasks-loading">Завантаження…</p>
    </div>
  `;

  wireAiBreakdown(wrapper, task, detailedSubtasks);
  loadSubtasks(wrapper, task, detailedSubtasks);

  return wrapper;
}

// «✨ Розбити на кроки» — надсилає назву задачі в ai-assist/
// (Groq), отримує 3-5 кроків і зберігає кожен звичайною
// addSubtask() (RLS-захищена, той самий шлях, що й ручне додавання
// підзадачі) — сама функція в базу не пише нічого.
function wireAiBreakdown(wrapper, task, detailedSubtasks) {
  const button = wrapper.querySelector(".task-card__ai-breakdown");
  const idleLabel = button.textContent;

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Розбиваю…";

    try {
      const steps = await breakdownTaskWithAI(task.title);
      for (const step of steps) {
        await addSubtask(task.id, step);
      }
      loadSubtasks(wrapper, task, detailedSubtasks);
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося розбити задачу на кроки. Спробуйте ще раз.");
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });
}

// Викликається і при першому рендері блоку, і повторно після
// «✨ Розбити на кроки» — тому завжди звертається до стабільного
// .task-card__subtasks-content (замінює весь його вміст), а не до
// плейсхолдера «Завантаження…», якого при повторному виклику вже
// нема в DOM.
function loadSubtasks(wrapper, task, detailedSubtasks) {
  const content = wrapper.querySelector(".task-card__subtasks-content");

  getSubtasks(task.id)
    .then((subtasks) => {
      const list = renderSubtaskList(subtasks, {
        onToggle: (subtask, completed) => setSubtaskCompleted(subtask.id, completed),
        onDelete: (subtask) => deleteSubtask(subtask.id),
        onAdd: (title) => addSubtask(task.id, title),
        onEditTitle: (subtask, title) => setSubtaskTitle(subtask.id, title),
        // Новий порядок (кнопки «↑»/«↓») — SubtaskList уже переставив
        // рядки оптимістично; тут лише зберігаємо, а при помилці
        // перечитуємо список, щоб DOM не розійшовся з базою.
        onReorder: async (orderedIds) => {
          try {
            await setSubtaskPositions(orderedIds);
          } catch (err) {
            console.error(err);
            window.alert("Не вдалося зберегти порядок підзадач. Оновлюю список…");
            loadSubtasks(wrapper, task, detailedSubtasks);
          }
        },
        // Міні-дедлайн і міні-теги підзадачі — лише на сторінці
        // детального перегляду (detailedSubtasks); у компактних
        // картках («Вхідні», «Задачі», дошка) рядок підзадачі й
        // далі лишається простим чекліст-пунктом.
        onDueDateChange: detailedSubtasks
          ? (subtask, dueDate) => setSubtaskDueDate(subtask.id, dueDate)
          : undefined,
        onAddTag: detailedSubtasks
          ? (subtask, tag) => setSubtaskTags(subtask.id, [...(subtask.tags || []), tag])
          : undefined,
        detailed: detailedSubtasks,
      });
      content.replaceChildren(list);
    })
    .catch((err) => {
      console.error(err);
      const error = document.createElement("p");
      error.className = "task-card__subtasks-loading";
      error.textContent = "Не вдалося завантажити підзадачі. Спробуйте оновити сторінку.";
      content.replaceChildren(error);
    });
}
