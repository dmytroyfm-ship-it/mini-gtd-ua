// Один рядок «Джерел»: платформа, @handle/URL, id для налаштування
// зовнішнього парсера (Apify/Firecrawl → feed-webhook) і кнопка
// видалення. Сам нічого не видаляє — викликає handlers.onDelete
// (PROJECT_RULES, п.6).

const PLATFORM_LABELS = {
  youtube: "YouTube",
  telegram: "Telegram",
  instagram: "Instagram",
  threads: "Threads",
  reddit: "Reddit",
  twitter: "Twitter",
  rss: "RSS",
};

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

export function renderSourceItem(source, handlers = {}) {
  const { onDelete } = handlers;

  const safeHandle = escapeHtml(source.handle);

  const row = document.createElement("li");
  row.className = "source-item";
  row.innerHTML = `
    <div class="source-item__body">
      <span class="source-item__platform">${PLATFORM_LABELS[source.platform] || source.platform}</span>
      <span class="source-item__handle">${safeHandle}</span>
      <span class="source-item__id">ID для вебхука: <code>${source.id}</code></span>
    </div>
    <button type="button" class="source-item__delete" aria-label="Видалити джерело «${safeHandle}»">✕</button>
  `;

  const deleteButton = row.querySelector(".source-item__delete");
  deleteButton.addEventListener("click", async () => {
    if (!onDelete) return;

    deleteButton.disabled = true;

    try {
      await onDelete(source);
    } catch (err) {
      console.error(err);
      deleteButton.disabled = false;
      window.alert("Не вдалося видалити джерело. Спробуйте ще раз.");
    }
  });

  return row;
}
