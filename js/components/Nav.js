// UI-компонент навігації: рендерить меню, підсвічує активний
// маршрут, керує бургер-меню на мобільних і монтує меню акаунта
// (AccountMenu.js — фото, ім'я, «Інтеграції», «Вийти»). Список
// маршрутів бере з router.js; сама рішень про автентифікацію не
// приймає (PROJECT_RULES, п.6) — це вже робить AccountMenu.js/
// authStore.js.
//
// Пошук — окрема кнопка-лупа праворуч, з розділювачем перед нею,
// одразу перед іконкою акаунта. На десктопі жодних auto-margin у
// барі нема — все компактно зліва направо (бренд, розділювач,
// посилання, розділювач, лупа, акаунт), без розтягнутих проміжків
// усередині. На мобільному .nav__panel випадає з потоку
// (position: fixed), тож .nav__search там отримує власний
// margin-left: auto, інакше лупа лишалась би зліва біля бренду замість
// правого краю поруч з акаунтом; сам розділювач перед лупою на
// мобільному ховається (сенсу нема, коли посилання все одно сховані
// в бургер-меню).
//
// Клік по лупі розкриває поле; під час набору (з дебаунсом) —
// випадний список до 6 збігів (searchTasks() з taskStore.js), клік
// по одному одразу відкриває задачу; Enter/кнопка — повний список на
// /search (js/pages/search.js), запит туди передається через
// setPendingSearchQuery() — маршрутизація query-рядків не підтримує.

import { getRoutes, navigate } from "../router.js";
import { renderAccountMenu } from "./AccountMenu.js";
import { setPendingSearchQuery } from "../pages/search.js";
import { searchTasks } from "../store/taskStore.js";

const AUTH_PATH = "/auth";
const SUGGESTION_LIMIT = 6;
const DEBOUNCE_MS = 280;

const SEARCH_ICON_SVG = `
  <svg viewBox="0 0 20 20" aria-hidden="true" class="nav__search-icon">
    <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="1.6" />
    <line x1="13.1" y1="13.1" x2="17.5" y2="17.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
`;

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

let rootEl = null;
let panelEl = null;
let burgerEl = null;
let overlayEl = null;
let linkEls = [];
let accountMenu = null;

export function mountNav(root) {
  rootEl = root;
  const routes = getRoutes();

  root.innerHTML = `
    <div class="nav__bar">
      <button type="button" class="nav__burger" aria-label="Відкрити меню" aria-expanded="false" aria-controls="nav-menu">
        <span aria-hidden="true">☰</span>
      </button>
      <a href="/inbox" data-link class="nav__brand">Mini GTD</a>
      <span class="nav__divider" aria-hidden="true"></span>
      <div class="nav__panel" id="nav-menu">
        <ul class="nav__links">
          ${routes
            .map(
              (route) => `
            <li>
              <a href="${route.path}" data-link data-path="${route.path}" class="nav__link">${route.title}</a>
            </li>
            ${route.path === "/inbox" ? `<li class="nav__divider" aria-hidden="true"></li>` : ""}
          `
            )
            .join("")}
        </ul>
      </div>
      <span class="nav__divider nav__divider--search" aria-hidden="true"></span>
      <div class="nav__search">
        <button type="button" class="nav__search-toggle" aria-label="Пошук" aria-expanded="false" aria-controls="nav-search-panel">
          ${SEARCH_ICON_SVG}
        </button>
        <div class="nav__search-panel" id="nav-search-panel" hidden>
          <form class="nav__search-form" role="search">
            <input
              type="search"
              class="nav__search-input"
              placeholder="Пошук…"
              aria-label="Пошук задач за словом чи тегом"
              autocomplete="off"
            />
          </form>
          <ul class="nav__search-suggestions" hidden></ul>
        </div>
      </div>
      <div class="nav__account-slot"></div>
    </div>
    <div class="nav__overlay"></div>
  `;

  panelEl = root.querySelector(".nav__panel");
  burgerEl = root.querySelector(".nav__burger");
  overlayEl = root.querySelector(".nav__overlay");
  linkEls = Array.from(root.querySelectorAll(".nav__link"));

  accountMenu = renderAccountMenu();
  root.querySelector(".nav__account-slot").appendChild(accountMenu.el);

  burgerEl.addEventListener("click", toggleMenu);
  overlayEl.addEventListener("click", closeMenu);
  panelEl.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  wireSearch(root);
}

// Кнопка-лупа: клік розкриває панель з полем; під час набору (з
// дебаунсом — не смикати базу на кожну літеру) — випадний список до
// SUGGESTION_LIMIT збігів, клік по одному одразу відкриває задачу.
// Enter/кнопка форми (тут форми немає кнопки — лише Enter) веде на
// повний список /search.
function wireSearch(root) {
  const toggle = root.querySelector(".nav__search-toggle");
  const panel = root.querySelector(".nav__search-panel");
  const form = root.querySelector(".nav__search-form");
  const input = root.querySelector(".nav__search-input");
  const suggestionsEl = root.querySelector(".nav__search-suggestions");

  let debounceTimer = null;
  let requestId = 0; // застаріла відповідь (повільніший попередній запит) не має перезаписати свіжішу

  function clearSuggestions() {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = "";
  }

  function openSearch() {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    input.focus();
  }

  function closeSearch() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    clearSuggestions();
    input.value = "";
    if (debounceTimer) clearTimeout(debounceTimer);
  }

  function renderSuggestions(tasks) {
    if (tasks.length === 0) {
      clearSuggestions();
      return;
    }

    suggestionsEl.innerHTML = tasks
      .slice(0, SUGGESTION_LIMIT)
      .map(
        (task) => `
          <li>
            <a href="/task/${task.id}" data-link class="nav__search-suggestion">${escapeHtml(task.title)}</a>
          </li>
        `
      )
      .join("");
    suggestionsEl.hidden = false;
  }

  toggle.addEventListener("click", () => {
    if (panel.hidden) openSearch();
    else closeSearch();
  });

  input.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);

    const query = input.value.trim();
    if (!query) {
      clearSuggestions();
      return;
    }

    debounceTimer = setTimeout(async () => {
      const thisRequest = ++requestId;
      try {
        const tasks = await searchTasks(query);
        if (thisRequest !== requestId) return; // відповідь уже не на останній введений запит
        renderSuggestions(tasks);
      } catch (err) {
        console.error(err);
      }
    }, DEBOUNCE_MS);
  });

  suggestionsEl.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeSearch();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    setPendingSearchQuery(query);
    closeSearch();
    navigate("/search").catch((err) => console.error("Помилка переходу:", err));
  });

  document.addEventListener("click", (event) => {
    if (!panel.hidden && !event.target.closest(".nav__search")) closeSearch();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closeSearch();
  });
}

function toggleMenu() {
  const isOpen = panelEl.classList.toggle("is-open");
  overlayEl.classList.toggle("is-open", isOpen);
  burgerEl.setAttribute("aria-expanded", String(isOpen));
}

function closeMenu() {
  panelEl.classList.remove("is-open");
  overlayEl.classList.remove("is-open");
  burgerEl.setAttribute("aria-expanded", "false");
}

function updateActiveLink(path) {
  linkEls.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.path === path);
  });
}

// Викликається router.js після кожного переходу. Сесія на момент
// mountNav() могла ще не встигнути прийти (initAuth() у app.js
// гарантує це лише для першого рендеру) — refresh() тут підтягує
// вже готову сесію в аватар/ім'я в меню акаунта щоразу.
export function refreshNav(path) {
  rootEl.classList.toggle("nav--hidden", path === AUTH_PATH);
  updateActiveLink(path);
  if (accountMenu) accountMenu.refresh();
}
