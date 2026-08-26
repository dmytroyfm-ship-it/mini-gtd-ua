// Заголовок картки задачі — чекбокс «виконано», назва-посилання,
// кнопки «✎»/кошик (`.task-card__header`), і слот нотатки під ними
// (`.task-card__note-slot`). Інлайн-редагування назви+нотатки живе
// тут же: обидва поля міняються на форму разом і разом
// зберігаються/скасовуються — ділити далі не було сенсу.
//
// Винесено з TaskCard.js (файл переріс 670+ рядків, поєднуючи п'ять
// незалежних блоків картки) — той самий принцип самодостатнього
// блоку, що вже є в SubtaskItem.js/MaterialsBlock.js (PROJECT_RULES,
// п.3: один файл — один компонент).

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

const TRASH_ICON_SVG = `
  <svg viewBox="0 0 20 20" aria-hidden="true" class="task-card__trash-icon">
    <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 9.4A1.5 1.5 0 0 0 7.6 17h4.8a1.5 1.5 0 0 0 1.5-1.6L14.5 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

// Повертає DocumentFragment із двома сусідніми вузлами —
// .task-card__header і .task-card__note-slot (TaskCard.js додає
// обидва в картку одним appendChild). querySelector() на фрагменті
// працює до вставки в документ — посилання на вузли лишаються
// робочими й після (переміщення в DOM не знищує самі елементи).
export function renderTaskCardHeader(task, handlers = {}) {
  const { onToggleCompleted, onDelete, onEditTask } = handlers;

  const safeTitle = escapeHtml(task.title);
  const noteHtml = task.note ? `<p class="task-card__note">${escapeHtml(task.note)}</p>` : "";

  const container = document.createElement("div");
  container.innerHTML = `
    <div class="task-card__header">
      <input
        type="checkbox"
        class="task-card__checkbox"
        ${task.completed ? "checked" : ""}
        aria-label="Позначити «${safeTitle}» виконаною"
      />
      <h3 class="task-card__title">
        <a class="task-card__title-link" href="/task/${task.id}" data-link>${safeTitle}</a>
      </h3>
      <button type="button" class="task-card__edit" aria-label="Редагувати «${safeTitle}»">✎</button>
      <button type="button" class="task-card__trash" aria-label="Перемістити «${safeTitle}» в кошик">
        ${TRASH_ICON_SVG}
      </button>
    </div>
    <div class="task-card__note-slot">${noteHtml}</div>
  `;

  const fragment = document.createDocumentFragment();
  while (container.firstChild) fragment.appendChild(container.firstChild);

  const header = fragment.querySelector(".task-card__header");
  const noteSlot = fragment.querySelector(".task-card__note-slot");

  wireCompletedCheckbox(header, task, onToggleCompleted);
  wireTrashButton(header, task, onDelete);
  wireEditTask(header, noteSlot, task, onEditTask);

  return fragment;
}

function wireCompletedCheckbox(header, task, onToggleCompleted) {
  const checkbox = header.querySelector(".task-card__checkbox");

  checkbox.addEventListener("change", async () => {
    if (!onToggleCompleted) return;

    const next = checkbox.checked;
    checkbox.disabled = true;

    try {
      await onToggleCompleted(task, next);
    } catch (err) {
      console.error(err);
      checkbox.checked = !next;
      window.alert("Не вдалося оновити задачу. Спробуйте ще раз.");
    } finally {
      checkbox.disabled = false;
    }
  });
}

function wireTrashButton(header, task, onDelete) {
  const trashButton = header.querySelector(".task-card__trash");

  trashButton.addEventListener("click", async () => {
    if (!onDelete) return;

    trashButton.disabled = true;

    try {
      await onDelete(task);
    } catch (err) {
      console.error(err);
      trashButton.disabled = false;
      window.alert("Не вдалося видалити задачу. Спробуйте ще раз.");
    }
  });
}

// Розтягує textarea назви по висоті під фактичний вміст (перенесені
// рядки довгого заголовка) — інакше textarea лишалась би висотою в
// один рядок і текст все одно ховався б за прокруткою, тільки вже
// вертикальною замість горизонтальної.
function autoGrowTitle(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

// Клік по «✎» — назва (<h3>) і нотатка (слот поруч, завжди є в
// розмітці, навіть порожній) міняються разом на форму: текстове
// поле + textarea. На відміну від інлайн-редагування підзадачі
// (SubtaskItem.js) чи імені в акаунті (AccountMenu.js) тут два
// поля одразу й окрема кнопка «Зберегти» — просто «клікнув повз»
// не мало б випадково зберігати ще не завершену нотатку.
function wireEditTask(header, noteSlot, task, onEditTask) {
  const editButton = header.querySelector(".task-card__edit");

  editButton.addEventListener("click", () => {
    const titleHeading = header.querySelector(".task-card__title");
    if (!titleHeading) return; // вже редагується

    const originalNoteHTML = noteSlot.innerHTML;

    // Замінюємо сам <h3> (а не лише його innerHTML) на <textarea> —
    // інакше поле вводу опиняється вкладеним у h3 з flex-basis:
    // auto, і його width: 100% рахується від щойно перерахованого
    // (за вмістом самого інпута) розміру h3, а не від реальної
    // ширини картки — на довгих назвах поле виглядало обрізаним.
    // Замінивши h3 цілком, .task-card__edit-title-input сам стає
    // flex-елементом .task-card__header (той самий flex: 1 1 auto;
    // min-width: 0, що й був у h3 — див. CSS) і росте нормально.
    //
    // <textarea>, а не однорядковий <input>: на довгій назві однорядкове
    // поле прокручується по горизонталі й показує лише частину тексту
    // біля курсора (саме це користувач і побачив на скріні) — textarea
    // з autoGrowTitle() переносить рядки й розтягується по висоті, тож
    // весь текст видно одразу.
    const titleInput = document.createElement("textarea");
    titleInput.rows = 1;
    titleInput.className = "task-card__edit-title-input";
    titleInput.value = task.title;
    titleHeading.replaceWith(titleInput);
    autoGrowTitle(titleInput);
    titleInput.addEventListener("input", () => autoGrowTitle(titleInput));

    noteSlot.innerHTML = `
      <textarea class="task-card__edit-note-input" rows="2" placeholder="Додаткові деталі…">${escapeHtml(task.note || "")}</textarea>
      <div class="task-card__edit-actions">
        <button type="button" class="task-card__edit-save">Зберегти</button>
        <button type="button" class="task-card__edit-cancel">Скасувати</button>
      </div>
    `;
    const noteInput = noteSlot.querySelector(".task-card__edit-note-input");
    const saveButton = noteSlot.querySelector(".task-card__edit-save");
    const cancelButton = noteSlot.querySelector(".task-card__edit-cancel");

    titleInput.focus();
    titleInput.select();

    function restore() {
      titleInput.replaceWith(titleHeading); // titleHeading — той самий незайманий вузол, innerHTML не чіпали
      noteSlot.innerHTML = originalNoteHTML;
    }

    cancelButton.addEventListener("click", restore);

    titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        restore();
        return;
      }
      // Enter у назві зберігає (а не вставляє новий рядок — назва
      // задачі однорядкова за змістом, textarea тут лише для того,
      // щоб довгий текст переносився й був повністю видимий).
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        saveButton.click();
      }
    });
    noteInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") restore();
    });

    saveButton.addEventListener("click", async () => {
      if (!onEditTask) return restore();

      const nextTitle = titleInput.value.trim();
      if (!nextTitle) {
        window.alert("Назва задачі не може бути порожньою.");
        return;
      }

      saveButton.disabled = true;
      cancelButton.disabled = true;

      try {
        await onEditTask(task, { title: nextTitle, note: noteInput.value.trim() });
        // Успіх: onEditTask сам перечитує задачу й перемальовує
        // картку заново (той самий підхід, що й у решти handlers) —
        // тут DOM більше не чіпаємо.
      } catch (err) {
        console.error(err);
        saveButton.disabled = false;
        cancelButton.disabled = false;
        window.alert("Не вдалося зберегти зміни. Спробуйте ще раз.");
      }
    });
  });
}
