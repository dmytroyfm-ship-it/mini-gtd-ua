// Форма додавання задачі (картка). Сама задачу не створює й не
// зберігає — при валідній відправці викликає onSubmit із введеними
// значеннями, показує стан збереження й помилку (якщо onSubmit
// кинув виняток). Куди значення йдуть далі (сховище, збереження) —
// вирішує викликач (PROJECT_RULES, п.6).

const IDLE_LABEL = "Зберегти задачу";
const SAVING_LABEL = "Збереження…";

export function renderTaskForm(onSubmit) {
  const wrapper = document.createElement("div");
  wrapper.className = "task-form-card";
  wrapper.innerHTML = `
    <form class="task-form" novalidate>
      <input
        class="task-form__input"
        type="text"
        name="title"
        placeholder="Що треба зробити?"
        aria-label="Що треба зробити?"
        required
      />
      <textarea
        class="task-form__textarea"
        name="note"
        rows="3"
        placeholder="Додаткові деталі…"
        aria-label="Додаткові деталі"
      ></textarea>
      <button type="submit" class="task-form__submit">${IDLE_LABEL}</button>
      <p class="task-form__error" hidden></p>
    </form>
  `;

  const form = wrapper.querySelector(".task-form");
  const titleInput = form.querySelector('[name="title"]');
  const noteInput = form.querySelector('[name="note"]');
  const submitButton = form.querySelector(".task-form__submit");
  const error = form.querySelector(".task-form__error");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = SAVING_LABEL;
    error.hidden = true;

    try {
      await onSubmit({ title: titleInput.value, note: noteInput.value });
      titleInput.value = "";
      noteInput.value = "";
    } catch (err) {
      error.textContent = err?.message || "Не вдалося зберегти задачу. Спробуйте ще раз.";
      error.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = IDLE_LABEL;
    }
  });

  return wrapper;
}
