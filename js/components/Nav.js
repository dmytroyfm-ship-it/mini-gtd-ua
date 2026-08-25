// UI-компонент навігації: рендерить меню, підсвічує активний
// маршрут, керує бургер-меню на мобільних і монтує меню акаунта
// (AccountMenu.js — фото, ім'я, «Інтеграції», «Вийти»). Список
// маршрутів бере з router.js; сама рішень про автентифікацію не
// приймає (PROJECT_RULES, п.6) — це вже робить AccountMenu.js/
// authStore.js.

import { getRoutes } from "../router.js";
import { renderAccountMenu } from "./AccountMenu.js";

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
      <a href="/inbox" data-link class="nav__brand">Mini GTD UA</a>
      <div class="nav__panel" id="nav-menu">
        <ul class="nav__links">
          ${routes
            .map(
              (route) => `
            <li>
              <a href="${route.path}" data-link data-path="${route.path}" class="nav__link">${route.title}</a>
            </li>
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
