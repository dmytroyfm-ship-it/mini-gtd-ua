// Сторінка «Кошик» (/trash).
// Показує задачі з непорожнім deleted_at; дозволяє відновити
// (очистити deleted_at) або видалити остаточно (реальний DELETE).

import { getTrashedTasks, restoreTask, deleteTaskPermanently } from "../store/taskStore.js";
import { renderTrashList } from "../components/TrashList.js";

export async function renderTrash(root) {
  root.innerHTML = `<h1 class="page__title">Кошик</h1>`;

  let listSlot = document.createElement("p");
  listSlot.className = "page__text";
  listSlot.textContent = "Завантаження…";
  root.appendChild(listSlot);

  async function refreshList() {
    let nextEl;

    try {
      const tasks = await getTrashedTasks();
      nextEl = renderTrashList(tasks, {
        onRestore: handleRestore,
        onDeleteForever: handleDeleteForever,
      });
    } catch (err) {
      nextEl = document.createElement("p");
      nextEl.className = "page__text";
      nextEl.textContent = err instanceof Error ? err.message : "Не вдалося завантажити кошик.";
    }

    listSlot.replaceWith(nextEl);
    listSlot = nextEl;
  }

  async function handleRestore(task) {
    await restoreTask(task.id);
    await refreshList();
  }

  async function handleDeleteForever(task) {
    await deleteTaskPermanently(task.id);
    await refreshList();
  }

  await refreshList();
}
