// Сторінка «Стрічка» (/feed) — пости з «Джерел», зібрані через
// supabase/functions/feed-webhook/.

import { getFeedItems, skipFeedItem, markFeedItemAdded } from "../store/feedStore.js";
import { addTask } from "../store/taskStore.js";
import { renderFeedList } from "../components/FeedList.js";

export async function renderFeed(root) {
  root.innerHTML = `<h1 class="page__title">Стрічка</h1>`;

  let listSlot = document.createElement("p");
  listSlot.className = "page__text";
  listSlot.textContent = "Завантаження…";
  root.appendChild(listSlot);

  async function refreshList() {
    let nextEl;

    try {
      const items = await getFeedItems();
      nextEl = renderFeedList(items, {
        onAddToInbox: handleAddToInbox,
        onSkip: handleSkip,
      });
    } catch (err) {
      console.error(err);
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = "Не вдалося завантажити стрічку. Спробуйте оновити сторінку.";
    }

    listSlot.replaceWith(nextEl);
    listSlot = nextEl;
  }

  // Задача одразу з перекладеним заголовком; посилання на оригінал
  // лишається в нотатці — щоб не загубити джерело, коли пост
  // покине стрічку.
  async function handleAddToInbox(item) {
    await addTask({ title: item.title_uk || item.title, note: item.url });
    await markFeedItemAdded(item.id);
    await refreshList();
  }

  async function handleSkip(item) {
    await skipFeedItem(item.id);
    await refreshList();
  }

  await refreshList();
}
