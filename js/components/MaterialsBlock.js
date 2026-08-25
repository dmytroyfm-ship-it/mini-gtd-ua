// Блок «Матеріали» під карткою задачі (сторінка /task/:id): ряд
// кнопок додавання за типом + сітка вже доданих матеріалів. Сам
// вантажить і оновлює свої дані (getMaterials/addMaterial/
// deleteMaterial) — той самий підхід, що й підзадачі в
// TaskCard.js (PROJECT_RULES, п.6 — бізнес-логіка в store, не тут).
//
// «Зображення» / «Файл» — реальне завантаження в Supabase Storage
// (бакет user-uploads, той самий, що й фото акаунта — storageStore.js),
// шлях {user_id}/materials/{task_id}/{файл}. «З папки на ПК» — окрема
// кнопка з попередньої версії прибрана: по суті те саме, що «Файл».

import { getMaterials, addMaterial, deleteMaterial } from "../store/materialStore.js";
import { uploadFile } from "../store/storageStore.js";
import { getSession } from "../store/authStore.js";

const ADD_BUTTONS = [
  { type: "link", label: "Посилання" },
  { type: "file", label: "Зображення", upload: true, accept: "image/*" },
  { type: "file", label: "Файл", upload: true, accept: "*/*" },
  { type: "onedrive", label: "OneDrive" },
  { type: "gdrive", label: "Google Drive" },
];

const TYPE_ICON_SVG = {
  link: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 12l4-4m-5.5 5.5L5 15a3 3 0 01-4.24-4.24L3.5 8m5-5L7 4.5A3 3 0 0011.24 8.74L13 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  onedrive: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.5 15h8a3 3 0 000-6 4.5 4.5 0 00-8.6-1.5A3.5 3.5 0 006.5 15z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  gdrive: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7.5 3L2 12.5l2.5 4.3h11l2.5-4.3L12.5 3h-5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M2 12.5h11" stroke="currentColor" stroke-width="1.4"/></svg>`,
  file: `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 3h5l4 4v10a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M11 3v4h4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
};

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

export function renderMaterialsBlock(taskId) {
  const wrapper = document.createElement("div");
  wrapper.className = "materials-block";
  wrapper.innerHTML = `
    <h2 class="materials-block__title">Матеріали</h2>
    <div class="materials-block__actions"></div>
    <div class="materials-block__grid"></div>
  `;

  const actions = wrapper.querySelector(".materials-block__actions");
  const grid = wrapper.querySelector(".materials-block__grid");

  // Один прихований інпут на обидві кнопки завантаження
  // («Зображення»/«Файл») — accept підставляється перед кожним
  // кліком залежно від того, яку саме кнопку натиснули.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.hidden = true;
  wrapper.appendChild(fileInput);

  let pendingLabel = "";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (file) handleUploadFile(file, pendingLabel);
  });

  ADD_BUTTONS.forEach((btn) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "materials-block__add-button";
    button.textContent = btn.label;
    button.addEventListener("click", () => {
      if (btn.upload) {
        pendingLabel = btn.label;
        fileInput.accept = btn.accept || "*/*";
        fileInput.click();
        return;
      }
      handleAddLink(btn.type, btn.label);
    });
    actions.appendChild(button);
  });

  async function refresh() {
    grid.innerHTML = `<p class="page__text">Завантаження…</p>`;

    let materials;
    try {
      materials = await getMaterials(taskId);
    } catch (err) {
      console.error(err);
      grid.innerHTML = "";
      const error = document.createElement("p");
      error.className = "page__text";
      error.textContent = "Не вдалося завантажити матеріали. Спробуйте оновити сторінку.";
      grid.appendChild(error);
      return;
    }

    grid.innerHTML = "";

    if (materials.length === 0) {
      const empty = document.createElement("p");
      empty.className = "materials-block__empty";
      empty.textContent = "Матеріалів ще немає.";
      grid.appendChild(empty);
      return;
    }

    materials.forEach((material) => grid.appendChild(renderMaterialCard(material)));
  }

  function renderMaterialCard(material) {
    const safeTitle = escapeHtml(material.title || material.url);

    const card = document.createElement("div");
    card.className = "material-card";
    card.innerHTML = `
      <a class="material-card__link" href="${escapeHtml(material.url)}" target="_blank" rel="noopener noreferrer">
        <span class="material-card__icon">${TYPE_ICON_SVG[material.type] || TYPE_ICON_SVG.link}</span>
        <span class="material-card__title">${safeTitle}</span>
      </a>
      <button type="button" class="material-card__delete" aria-label="Видалити матеріал «${safeTitle}»">✕</button>
    `;

    const deleteButton = card.querySelector(".material-card__delete");
    deleteButton.addEventListener("click", async () => {
      deleteButton.disabled = true;

      try {
        await deleteMaterial(material.id);
        card.remove();
        if (!grid.children.length) refresh();
      } catch (err) {
        console.error(err);
        deleteButton.disabled = false;
        window.alert("Не вдалося видалити матеріал. Спробуйте ще раз.");
      }
    });

    return card;
  }

  async function handleAddLink(type, label) {
    const url = window.prompt(`${label} — встав посилання:`);
    if (!url || !url.trim()) return;

    const trimmedUrl = url.trim();
    const title = window.prompt("Назва (можна лишити як є):", trimmedUrl);
    const finalTitle = (title || trimmedUrl).trim();

    try {
      await addMaterial(taskId, { type, url: trimmedUrl, title: finalTitle });
      await refresh();
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося додати матеріал. Спробуйте ще раз.");
    }
  }

  async function handleUploadFile(file, label) {
    const session = getSession();
    if (!session) {
      window.alert("Немає активної сесії — увійдіть ще раз.");
      return;
    }

    try {
      const path = `${session.id}/materials/${taskId}/${Date.now()}-${file.name}`;
      const url = await uploadFile(path, file);
      await addMaterial(taskId, { type: "file", url, title: file.name });
      await refresh();
    } catch (err) {
      console.error(err);
      window.alert(`Не вдалося завантажити «${label.toLowerCase()}». Спробуйте ще раз.`);
    }
  }

  refresh();

  return wrapper;
}
