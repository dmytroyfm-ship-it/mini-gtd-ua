// Меню акаунта в навігації: аватар-кнопка, що відкриває панель з
// фото, ім'ям (можна редагувати), поштою, посиланням на
// «Інтеграції» й кнопкою «Вийти». Раніше пошта й «Вийти» висіли
// прямо в барі навігації — перенесено сюди, щоб не займати місце
// в головному меню (PROJECT_RULES, п.6 — сама лише показує стан і
// віддає дії в authStore.js, рішень про автентифікацію не приймає).

import { navigate } from "../router.js";
import { getSession, signOut, updateDisplayName } from "../store/authStore.js";

const AUTH_PATH = "/auth";

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

function initialsOf(session) {
  const source = session.name || session.email;
  return source.trim().charAt(0).toUpperCase();
}

function avatarHtml(session, sizeClass) {
  if (session.avatarUrl) {
    return `<img class="account-menu__avatar ${sizeClass}" src="${escapeHtml(session.avatarUrl)}" alt="" />`;
  }
  return `<span class="account-menu__avatar account-menu__avatar--fallback ${sizeClass}">${escapeHtml(initialsOf(session))}</span>`;
}

export function renderAccountMenu() {
  const wrapper = document.createElement("div");
  wrapper.className = "account-menu";
  wrapper.innerHTML = `
    <button type="button" class="account-menu__trigger" aria-haspopup="true" aria-expanded="false" aria-label="Акаунт"></button>
    <div class="account-menu__panel" hidden>
      <div class="account-menu__header"></div>
      <button type="button" class="account-menu__photo-note-trigger">Змінити фото</button>
      <a href="/integrations" data-link class="account-menu__link">Інтеграції</a>
      <button type="button" class="account-menu__logout">Вийти</button>
    </div>
  `;

  const trigger = wrapper.querySelector(".account-menu__trigger");
  const panel = wrapper.querySelector(".account-menu__panel");
  const header = wrapper.querySelector(".account-menu__header");
  const photoNoteTrigger = wrapper.querySelector(".account-menu__photo-note-trigger");
  const link = wrapper.querySelector(".account-menu__link");
  const logoutButton = wrapper.querySelector(".account-menu__logout");

  function closePanel() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function openPanel() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  }

  function togglePanel() {
    if (panel.hidden) openPanel();
    else closePanel();
  }

  function startEditingName(session) {
    const nameRow = header.querySelector(".account-menu__name-row");
    const currentName = session.name || "";

    nameRow.innerHTML = `
      <form class="account-menu__name-form">
        <input type="text" class="account-menu__name-input" value="${escapeHtml(currentName)}" placeholder="Ім'я та прізвище" maxlength="80" />
      </form>
    `;

    const input = nameRow.querySelector(".account-menu__name-input");
    const form = nameRow.querySelector(".account-menu__name-form");
    input.focus();
    input.select();

    // Зберігає і по Enter (submit), і при звичайному кліку повз
    // поле (blur) — так очікують від будь-якого інлайн-редагування,
    // «просто клікнув убік» не мало б скасовувати введене. Escape —
    // єдиний спосіб явно скасувати.
    let cancelled = false;
    let saving = false;

    async function save() {
      if (saving) return;
      saving = true;

      const nextName = input.value.trim();
      if (nextName === currentName) {
        render();
        return;
      }

      input.disabled = true; // сам по собі викликає blur — saving-прапорець захищає від повторного save()

      try {
        await updateDisplayName(nextName);
      } catch (err) {
        console.error(err);
        window.alert("Не вдалося зберегти ім'я. Спробуйте ще раз.");
      } finally {
        render();
      }
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      save();
    });

    input.addEventListener("blur", () => {
      if (!cancelled) save();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        cancelled = true;
        render();
      }
    });
  }

  function render() {
    const session = getSession();
    if (!session) return;

    header.innerHTML = `
      ${avatarHtml(session, "account-menu__avatar--lg")}
      <div class="account-menu__info">
        <p class="account-menu__name-row">
          <button type="button" class="account-menu__name">${escapeHtml(session.name || "Додати ім'я")}</button>
        </p>
        <p class="account-menu__email">${escapeHtml(session.email)}</p>
      </div>
    `;

    trigger.innerHTML = avatarHtml(session, "");

    header
      .querySelector(".account-menu__name")
      .addEventListener("click", () => startEditingName(session));
  }

  trigger.addEventListener("click", togglePanel);

  photoNoteTrigger.addEventListener("click", () => {
    window.alert(
      "Завантаження власного фото поки не підключено — для цього потрібне окреме сховище (Supabase Storage), якого в проєкті ще немає. Зараз показується фото з твого Google-акаунта."
    );
  });

  link.addEventListener("click", closePanel);

  logoutButton.addEventListener("click", async () => {
    closePanel();
    await signOut();
    navigate(AUTH_PATH);
  });

  document.addEventListener("click", (event) => {
    // event.composedPath(), не event.target: клік по «Ім'я»
    // синхронно замінює nameRow.innerHTML на поле вводу — сама
    // кнопка, по якій клікнули, вже відʼєднана від DOM на момент,
    // коли цей обробник (на document) отримує подію в фазі
    // спливання, тож wrapper.contains(event.target) для неї
    // помилково повертав би false, миттєво закриваючи панель.
    // composedPath() лишає шлях таким, яким він був у момент кліку.
    if (!panel.hidden && !event.composedPath().includes(wrapper)) closePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closePanel();
  });

  render();

  return { el: wrapper, refresh: render };
}
