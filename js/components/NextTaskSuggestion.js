// Кнопка «✨ Що зробити зараз?» на «Вхідних» (js/pages/inbox.js) +
// картка-підказка з результатом. Сама нічого не знає про задачі чи
// Groq — лише викликає onRequestSuggestion() (сторінка вирішує, які
// задачі надіслати й через який store) і показує те, що він
// поверне (PROJECT_RULES, п.6):
//   { task, reason } — задача знайдена, показуємо картку;
//   null             — кандидатів нема (не помилка, порожній стан);
//   кидає виняток    — щось справді пішло не так.

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

export function renderNextTaskSuggestion(onRequestSuggestion) {
  const wrapper = document.createElement("div");
  wrapper.className = "ai-suggestion";
  wrapper.innerHTML = `
    <button type="button" class="ai-suggestion__button">✨ Що зробити зараз?</button>
    <div class="ai-suggestion__result" hidden></div>
  `;

  const button = wrapper.querySelector(".ai-suggestion__button");
  const result = wrapper.querySelector(".ai-suggestion__result");
  const idleLabel = button.textContent;

  function renderEmpty() {
    result.innerHTML = `<p class="ai-suggestion__reason">У списку «Задачі» поки нема з чого обирати.</p>`;
    result.hidden = false;
  }

  function renderSuggestion(task, reason) {
    result.innerHTML = `
      <p class="ai-suggestion__label">Спробуй зробити це зараз:</p>
      <a href="/task/${task.id}" data-link class="ai-suggestion__task">${escapeHtml(task.title)}</a>
      <p class="ai-suggestion__reason">${escapeHtml(reason)}</p>
      <button type="button" class="ai-suggestion__dismiss">Закрити</button>
    `;
    result.hidden = false;
    result.querySelector(".ai-suggestion__dismiss").addEventListener("click", () => {
      result.hidden = true;
    });
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Думаю…";
    result.hidden = true;

    try {
      const suggestion = await onRequestSuggestion();
      if (suggestion) renderSuggestion(suggestion.task, suggestion.reason);
      else renderEmpty();
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося отримати підказку від ШІ. Спробуйте ще раз.");
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  });

  return wrapper;
}
