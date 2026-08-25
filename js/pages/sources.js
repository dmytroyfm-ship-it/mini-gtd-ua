// Сторінка «Джерела» (/sources) — керування підписками, з яких
// зовнішній парсер (Apify/Firecrawl) забирає пости в «Стрічку».

import { getSources, addSource, deleteSource } from "../store/sourceStore.js";
import { renderSourceForm } from "../components/SourceForm.js";
import { renderSourceList } from "../components/SourceList.js";

export async function renderSources(root) {
  root.innerHTML = `<h1 class="page__title">Джерела</h1>`;

  root.appendChild(renderSourceForm(handleAdd));

  let listSlot = document.createElement("p");
  listSlot.className = "page__text";
  listSlot.textContent = "Завантаження…";
  root.appendChild(listSlot);

  async function refreshList() {
    let nextEl;

    try {
      const sources = await getSources();
      nextEl = renderSourceList(sources, { onDelete: handleDelete });
    } catch (err) {
      console.error(err);
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = "Не вдалося завантажити джерела. Спробуйте оновити сторінку.";
    }

    listSlot.replaceWith(nextEl);
    listSlot = nextEl;
  }

  async function handleAdd(values) {
    await addSource(values);
    await refreshList();
  }

  async function handleDelete(source) {
    await deleteSource(source.id);
    await refreshList();
  }

  await refreshList();
}
