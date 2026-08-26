// UI-компонент навігації: рендерить меню, підсвічує активний
// маршрут, керує бургер-меню на мобільних і монтує меню акаунта
// (AccountMenu.js — фото, ім'я, «Інтеграції», «Вийти»). Список
// маршрутів бере з router.js; сама рішень про автентифікацію не
// приймає (PROJECT_RULES, п.6) — це вже робить AccountMenu.js/
// authStore.js. Поле пошуку тут же — при відправці форми просто
// передає запит на /search (js/pages/search.js) через
// setPendingSearchQuery(), маршрутизація query-рядків не підтримує.

import { getRoutes, navigate } from "../router.js";
import { renderAccountMenu } from "./AccountMenu.js";
import { setPendingSearchQuery } from "../pages/search.js";

const AUTH_PATH = "/auth";

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
        <form class="nav__search" role="search">
          <input
            type="search"
            class="nav__search-input"
            placeholder="Пошук…"
            aria-label="Пошук задач за словом чи тегом"
          />
        </form>
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

  const searchForm = root.querySelector(".nav__search");
  const searchInput = root.querySelector(".nav__search-input");
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;

    setPendingSearchQuery(query);
    searchInput.value = "";
    closeMenu(); // на мобільному поле пошуку в тій самій висувній панелі, що й посилання
    navigate("/search").catch((err) => console.error("Помилка переходу:", err));
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
