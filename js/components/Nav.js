// UI-компонент навігації: рендерить меню, підсвічує активний
// маршрут, показує email користувача й кнопку виходу, керує
// бургер-меню на мобільних. Список маршрутів бере з router.js,
// сесію — з authStore.js; сама рішень про автентифікацію не
// приймає (PROJECT_RULES, п.6) — лише показує стан і за кліком
// на «Вийти» викликає signOut().

import { getRoutes, navigate } from "../router.js";
import { getSession, signOut } from "../store/authStore.js";

const AUTH_PATH = "/auth";

let rootEl = null;
let panelEl = null;
let burgerEl = null;
let overlayEl = null;
let userEmailEl = null;
let linkEls = [];

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
        <div class="nav__user">
          <span class="nav__user-email"></span>
          <button type="button" class="nav__logout">Вийти</button>
        </div>
      </div>
    </div>
    <div class="nav__overlay"></div>
  `;

  panelEl = root.querySelector(".nav__panel");
  burgerEl = root.querySelector(".nav__burger");
  overlayEl = root.querySelector(".nav__overlay");
  userEmailEl = root.querySelector(".nav__user-email");
  linkEls = Array.from(root.querySelectorAll(".nav__link"));

  burgerEl.addEventListener("click", toggleMenu);
  overlayEl.addEventListener("click", closeMenu);
  panelEl.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  root.querySelector(".nav__logout").addEventListener("click", async () => {
    await signOut();
    navigate(AUTH_PATH);
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

function updateUserSection() {
  const session = getSession();
  userEmailEl.textContent = session ? session.email : "";
}

// Викликається router.js після кожного переходу.
export function refreshNav(path) {
  rootEl.classList.toggle("nav--hidden", path === AUTH_PATH);
  updateActiveLink(path);
  updateUserSection();
}
