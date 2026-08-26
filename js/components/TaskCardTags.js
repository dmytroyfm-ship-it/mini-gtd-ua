// Теги картки задачі (`.task-card__tags`) — список тегів + «+ тег»
// (перетворюється на текстове поле; Enter/blur зберігає, Escape
// скасовує). Винесено з TaskCard.js (файл переріс 670+ рядків,
// поєднуючи п'ять незалежних блоків картки) — той самий принцип
// самодостатнього блоку, що вже є в SubtaskItem.js/MaterialsBlock.js.

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

export function renderTaskCardTags(task, handlers = {}) {
  const { onAddTag } = handlers;

  const tagsHtml = (task.tags || [])
    .map((tag) => `<li class="task-card__tag">${escapeHtml(tag)}</li>`)
    .join("");

  const wrapper = document.createElement("div");
  wrapper.className = "task-card__tags";
  wrapper.innerHTML = `
    <ul class="task-card__tag-list">${tagsHtml}</ul>
    <button type="button" class="task-card__add-tag">+ тег</button>
  `;

  wireAddTag(wrapper, task, onAddTag);

  return wrapper;
}

function wireAddTag(wrapper, task, onAddTag) {
  const addButton = wrapper.querySelector(".task-card__add-tag");

  addButton.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "task-card__tag-input";
    input.placeholder = "@тег";
    addButton.replaceWith(input);
    input.focus();

    let settled = false;

    function restore() {
      if (input.isConnected) input.replaceWith(addButton);
    }

    async function commit() {
      if (settled) return;
      settled = true;

      const value = input.value.trim();
      restore();
      if (!value || !onAddTag) return;

      try {
        await onAddTag(task, value);
      } catch (err) {
        console.error(err);
        window.alert("Не вдалося додати тег. Спробуйте ще раз.");
      }
    }

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        settled = true;
        restore();
      }
    });
    input.addEventListener("blur", commit);
  });
}
