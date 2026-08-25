// Картка поста в стрічці: Джерело · @автор · дата, заголовок і
// текст (українською — title_uk/text_uk, перекладені Groq у
// feed-webhook/; якщо переклад не вдався, підставляється оригінал),
// три дії. Сама нічого не зберігає — handlers.onAddToInbox/onSkip
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

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
}

export function renderFeedCard(item, handlers = {}) {
  const { onAddToInbox, onSkip } = handlers;

  const platformLabel = PLATFORM_LABELS[item.sources?.platform] || item.sources?.platform || "";
  const author = item.author ? `@${item.author}` : item.sources?.handle || "";
  const meta = [platformLabel, author, formatDate(item.published_at || item.created_at)]
    .filter(Boolean)
    .map((part) => escapeHtml(part))
    .join(" · ");

  const title = escapeHtml(item.title_uk || item.title);
  const text = escapeHtml(item.text_uk || item.text || "");

  const card = document.createElement("li");
  card.className = "feed-card";
  card.innerHTML = `
    <p class="feed-card__meta">${meta}</p>
    <h3 class="feed-card__title">${title}</h3>
    ${text ? `<p class="feed-card__text">${text}</p>` : ""}
    <div class="feed-card__actions">
      <button type="button" class="feed-card__inbox">✅ Додати у Вхідні</button>
      <button type="button" class="feed-card__skip">✖ Пропустити</button>
      <a class="feed-card__open" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">🔗 Відкрити</a>
    </div>
  `;

  const inboxButton = card.querySelector(".feed-card__inbox");
  const skipButton = card.querySelector(".feed-card__skip");

  function setBusy(busy) {
    inboxButton.disabled = busy;
    skipButton.disabled = busy;
  }

  inboxButton.addEventListener("click", async () => {
    if (!onAddToInbox) return;

    setBusy(true);
    try {
      await onAddToInbox(item);
    } catch (err) {
      console.error(err);
      setBusy(false);
      window.alert("Не вдалося додати у Вхідні. Спробуйте ще раз.");
    }
  });

  skipButton.addEventListener("click", async () => {
    if (!onSkip) return;

    setBusy(true);
    try {
      await onSkip(item);
    } catch (err) {
      console.error(err);
      setBusy(false);
      window.alert("Не вдалося пропустити пост. Спробуйте ще раз.");
    }
  });

  return card;
}
