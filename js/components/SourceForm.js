// Форма додавання джерела (сторінка «Джерела»). Сама нічого не
// зберігає — при валідній відправці викликає onSubmit, показує стан
// збереження й помилку (PROJECT_RULES, п.6, той самий підхід, що й
// TaskForm.js).

const PLATFORMS = [
  { value: "youtube", label: "YouTube" },
  { value: "telegram", label: "Telegram" },
  { value: "instagram", label: "Instagram" },
  { value: "threads", label: "Threads" },
  { value: "reddit", label: "Reddit" },
  { value: "twitter", label: "Twitter" },
  { value: "rss", label: "RSS" },
];

const IDLE_LABEL = "Додати";
const SAVING_LABEL = "Додавання…";

export function renderSourceForm(onSubmit) {
  const wrapper = document.createElement("div");
  wrapper.className = "source-form-card";
  wrapper.innerHTML = `
    <form class="source-form" novalidate>
      <select class="source-form__platform" aria-label="Платформа">
        ${PLATFORMS.map((p) => `<option value="${p.value}">${p.label}</option>`).join("")}
      </select>
      <input
        class="source-form__handle"
        type="text"
        name="handle"
        placeholder="@handle або посилання"
        aria-label="@handle або посилання"
        required
      />
      <button type="submit" class="source-form__submit">${IDLE_LABEL}</button>
    </form>
    <p class="source-form__error" hidden></p>
  `;

  const form = wrapper.querySelector(".source-form");
  const platformSelect = form.querySelector(".source-form__platform");
  const handleInput = form.querySelector(".source-form__handle");
  const submitButton = form.querySelector(".source-form__submit");
  const error = wrapper.querySelector(".source-form__error");

  // Стандартна бульбашка "Заповніть це поле" — мовою браузера, не
  // застосунку; setCustomValidity() гарантує українську (той самий
  // прийом, що й у TaskForm.js).
  handleInput.addEventListener("invalid", () => {
    handleInput.setCustomValidity(handleInput.value.trim() ? "" : "Вкажіть @handle або посилання.");
  });
  handleInput.addEventListener("input", () => {
    handleInput.setCustomValidity("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = SAVING_LABEL;
    error.hidden = true;

    try {
      await onSubmit({ platform: platformSelect.value, handle: handleInput.value.trim() });
      handleInput.value = "";
    } catch (err) {
      console.error(err);
      error.textContent = "Не вдалося додати джерело. Спробуйте ще раз.";
      error.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = IDLE_LABEL;
    }
  });

  return wrapper;
}
