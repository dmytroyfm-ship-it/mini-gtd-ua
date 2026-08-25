// Блок «Коментарі» під карткою задачі (сторінка /task/:id): форма
// додавання + список. Сам вантажить і оновлює свої дані
// (getComments/addComment/deleteComment) — той самий підхід, що й
// MaterialsBlock.js (PROJECT_RULES, п.6 — бізнес-логіка в store,
// не тут).

import { getComments, addComment, deleteComment } from "../store/commentStore.js";

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function renderCommentsBlock(taskId) {
  const wrapper = document.createElement("div");
  wrapper.className = "comments-block";
  wrapper.innerHTML = `
    <h2 class="comments-block__title">Коментарі</h2>
    <form class="comments-block__form">
      <textarea class="comments-block__input" placeholder="Написати коментар…" rows="2"></textarea>
      <button type="submit" class="comments-block__submit">Додати</button>
    </form>
    <div class="comments-block__list"></div>
  `;

  const form = wrapper.querySelector(".comments-block__form");
  const input = wrapper.querySelector(".comments-block__input");
  const submitButton = wrapper.querySelector(".comments-block__submit");
  const list = wrapper.querySelector(".comments-block__list");

  async function refresh() {
    list.innerHTML = `<p class="page__text">Завантаження…</p>`;

    let comments;
    try {
      comments = await getComments(taskId);
    } catch (err) {
      console.error(err);
      list.innerHTML = "";
      const error = document.createElement("p");
      error.className = "page__text";
      error.textContent = "Не вдалося завантажити коментарі. Спробуйте оновити сторінку.";
      list.appendChild(error);
      return;
    }

    list.innerHTML = "";

    if (comments.length === 0) {
      const empty = document.createElement("p");
      empty.className = "comments-block__empty";
      empty.textContent = "Коментарів ще немає.";
      list.appendChild(empty);
      return;
    }

    // Найновіші зверху — так зручніше бачити останнє без прокрутки,
    // коли коментарів багато.
    comments
      .slice()
      .reverse()
      .forEach((comment) => list.appendChild(renderComment(comment)));
  }

  function renderComment(comment) {
    const item = document.createElement("div");
    item.className = "comment-item";
    item.innerHTML = `
      <p class="comment-item__text">${escapeHtml(comment.text)}</p>
      <div class="comment-item__meta">
        <span class="comment-item__date">${formatDateTime(comment.created_at)}</span>
        <button type="button" class="comment-item__delete" aria-label="Видалити коментар">✕</button>
      </div>
    `;

    const deleteButton = item.querySelector(".comment-item__delete");
    deleteButton.addEventListener("click", async () => {
      deleteButton.disabled = true;

      try {
        await deleteComment(comment.id);
        item.remove();
        if (!list.children.length) refresh();
      } catch (err) {
        console.error(err);
        deleteButton.disabled = false;
        window.alert("Не вдалося видалити коментар. Спробуйте ще раз.");
      }
    });

    return item;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    submitButton.disabled = true;
    input.disabled = true;

    try {
      await addComment(taskId, text);
      input.value = "";
      await refresh();
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося додати коментар. Спробуйте ще раз.");
    } finally {
      submitButton.disabled = false;
      input.disabled = false;
    }
  });

  refresh();

  return wrapper;
}
