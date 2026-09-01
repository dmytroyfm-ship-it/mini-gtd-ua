// Меню акаунта в навігації: аватар-кнопка, що відкриває панель з
// фото, ім'ям (можна редагувати), поштою, посиланнями на
// «Джерела» (лише коли FEATURES.feed увімкнено, js/config.js) /
// «Інтеграції» / «Кошик» й кнопкою «Вийти». Раніше пошта й «Вийти»
// висіли прямо в барі навігації, а «Джерела»/«Кошик» — окремими
// вкладками головного меню — усе перенесено сюди, щоб не займати
// місце в головному меню (PROJECT_RULES, п.6 — сама лише показує
// стан і віддає дії в authStore.js, рішень про автентифікацію не
// приймає).

import { navigate } from "../router.js";
import {
  getSession,
  signOut,
  updateDisplayName,
  uploadAvatar,
  uploadBackground,
  resetBackground,
  subscribe,
} from "../store/authStore.js";
import { getTheme, toggleTheme } from "../store/themeStore.js";
import { FEATURES } from "../config.js";

const AUTH_PATH = "/auth";

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

// Розтягує textarea імені по висоті під фактичний вміст — той самий
// прийом, що й у TaskCard.js / SubtaskItem.js.
function autoGrow(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
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
      <button type="button" class="account-menu__theme-toggle"></button>
      <button type="button" class="account-menu__photo-trigger">Змінити фото</button>
      <input type="file" class="account-menu__photo-input" accept="image/*" hidden />
      <button type="button" class="account-menu__bg-trigger">Фонове зображення</button>
      <button type="button" class="account-menu__bg-reset" hidden>Прибрати фон</button>
      <input type="file" class="account-menu__bg-input" accept="image/*" hidden />
      ${FEATURES.feed ? `<a href="/sources" data-link class="account-menu__link">Джерела</a>` : ""}
      <a href="/integrations" data-link class="account-menu__link">Інтеграції</a>
      <a href="/trash" data-link class="account-menu__link">Кошик</a>
      <button type="button" class="account-menu__logout">Вийти</button>
    </div>
  `;

  const trigger = wrapper.querySelector(".account-menu__trigger");
  const panel = wrapper.querySelector(".account-menu__panel");
  const header = wrapper.querySelector(".account-menu__header");
  const themeToggle = wrapper.querySelector(".account-menu__theme-toggle");
  const photoTrigger = wrapper.querySelector(".account-menu__photo-trigger");
  const photoInput = wrapper.querySelector(".account-menu__photo-input");
  const bgTrigger = wrapper.querySelector(".account-menu__bg-trigger");
  const bgReset = wrapper.querySelector(".account-menu__bg-reset");
  const bgInput = wrapper.querySelector(".account-menu__bg-input");
  const links = wrapper.querySelectorAll(".account-menu__link");
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

  // Підпис описує ЦІЛЬ кліку (яку тему увімкне), а не поточну — так
  // само, як типові перемикачі теми в інших застосунках.
  function updateThemeToggle() {
    themeToggle.textContent = getTheme() === "dark" ? "☀️ Світла тема" : "🌙 Темна тема";
  }

  function startEditingName(session) {
    const nameRow = header.querySelector(".account-menu__name-row");
    const currentName = session.name || "";

    // <textarea>, не <input>: на довгому імені однорядкове поле
    // разом з input.select() показувало лише хвіст тексту біля
    // курсора (початок ховався за прокруткою в вузькій панелі
    // меню) — textarea переносить рядки й росте по висоті через
    // autoGrow(), тож видно все ім'я одразу (той самий фікс, що й у
    // TaskCard.js / SubtaskItem.js).
    nameRow.innerHTML = `
      <form class="account-menu__name-form">
        <textarea rows="1" class="account-menu__name-input" placeholder="Ім'я та прізвище" maxlength="80">${escapeHtml(currentName)}</textarea>
      </form>
    `;

    const input = nameRow.querySelector(".account-menu__name-input");
    const form = nameRow.querySelector(".account-menu__name-form");
    autoGrow(input);
    input.addEventListener("input", () => autoGrow(input));
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
        return;
      }
      // textarea, на відміну від input, не сабмітить форму по Enter
      // сама — доводиться зберігати явно (і не вставляти новий рядок,
      // ім'я однорядкове за змістом).
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        save();
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

    // Ім'я поруч з аватаром — тригер тепер рядок унизу бічної
    // панелі (не самотня іконка вгорі бару), самого фото замало,
    // щоб виглядало як "твій акаунт", а не ще один пункт меню.
    trigger.innerHTML = `
      ${avatarHtml(session, "")}
      <span class="account-menu__trigger-name">${escapeHtml(session.name || session.email)}</span>
    `;

    header
      .querySelector(".account-menu__name")
      .addEventListener("click", () => startEditingName(session));

    bgTrigger.textContent = session.backgroundUrl ? "Змінити фон" : "Фонове зображення";
    bgReset.hidden = !session.backgroundUrl;
  }

  trigger.addEventListener("click", togglePanel);

  themeToggle.addEventListener("click", () => {
    toggleTheme();
    updateThemeToggle();
  });

  photoTrigger.addEventListener("click", () => photoInput.click());

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    photoInput.value = ""; // той самий файл можна буде вибрати ще раз (напр. після невдачі)
    if (!file) return;

    photoTrigger.disabled = true;
    const idleLabel = photoTrigger.textContent;
    photoTrigger.textContent = "Завантаження…";

    try {
      await uploadAvatar(file);
      render();
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося завантажити фото. Спробуйте ще раз.");
    } finally {
      photoTrigger.disabled = false;
      photoTrigger.textContent = idleLabel;
    }
  });

  bgTrigger.addEventListener("click", () => bgInput.click());

  bgInput.addEventListener("change", async () => {
    const file = bgInput.files[0];
    bgInput.value = ""; // той самий файл можна буде вибрати ще раз (напр. після невдачі)
    if (!file) return;

    bgTrigger.disabled = true;
    const idleLabel = bgTrigger.textContent;
    bgTrigger.textContent = "Завантаження…";

    try {
      await uploadBackground(file);
      render();
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося завантажити фонове зображення. Спробуйте ще раз.");
    } finally {
      bgTrigger.disabled = false;
      bgTrigger.textContent = idleLabel;
    }
  });

  bgReset.addEventListener("click", async () => {
    bgReset.disabled = true;
    try {
      await resetBackground();
      render();
    } catch (err) {
      console.error(err);
      window.alert("Не вдалося прибрати фонове зображення. Спробуйте ще раз.");
    } finally {
      bgReset.disabled = false;
    }
  });

  links.forEach((link) => link.addEventListener("click", closePanel));

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

  // authStore.subscribe — не лише refreshNav(): ім'я/фото міняються
  // асинхронно (updateDisplayName()/uploadAvatar()), в будь-який
  // момент, не тільки при переході між сторінками.
  subscribe(render);

  updateThemeToggle();
  render();

  return { el: wrapper, refresh: render };
}
