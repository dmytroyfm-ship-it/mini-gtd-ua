// UI-компонент навігації: рендерить бічну панель (ліворуч, на весь
// зріст), підсвічує активний маршрут, на мобільному ховається за
// бургер-кнопкою в тонкій верхній смужці (.nav__mobile-bar — окремий
// елемент, не частина панелі, лишається на місці, поки сама панель
// виїжджає/ховається), монтує меню акаунта (AccountMenu.js — фото,
// ім'я, «Джерела»/«Кошик»/«Інтеграції», «Вийти») внизу панелі.
// Список маршрутів бере з router.js; сама рішень про автентифікацію
// не приймає (PROJECT_RULES, п.6) — це вже робить AccountMenu.js/
// authStore.js.
//
// Розкладка: body { display: flex } (css/style.css) — .nav звичайний
// флекс-елемент зліва (sticky, на всю висоту), #page-root займає
// решту ширини. На мобільному .nav__panel випадає з потоку
// (position: fixed, слайд-панель) — там і живе .nav__account-slot
// (внизу панелі) та кнопка-лупа пошуку (над ним).
//
// Пошук — рядок-кнопка з лупою всередині панелі, під розділювачем
// над акаунтом; клік розкриває САМЕ ПОЛЕ окремим виринаючим блоком
// по центру екрана (командна панель), а не всередині бічної
// навігації — .nav__panel має overflow-y: auto (прокрутка довгого
// списку пунктів), і блок, вкладений у неї, обрізався б цим самим
// overflow, щойно виходив за межі 240px ширини панелі (саме так
// користувач і побачив обрізаний текст). .nav__search-backdrop/
// .nav__search-panel — прямі діти кореня .nav (як .nav__overlay),
// не .nav__panel, — і fixed-позиціонування геть уникає проблеми
// незалежно від ширини екрана; той самий блок однаково добре
// виглядає і на десктопі, і на мобільному, окремих правил на
// в'юпорт більше не треба. Під час набору (з дебаунсом) — випадний
// список до SUGGESTION_LIMIT збігів (searchTasks() з taskStore.js),
// клік по одному одразу відкриває задачу; Enter/сабміт форми —
// повний список на /search (js/pages/search.js), запит туди
// передається через setPendingSearchQuery() — маршрутизація
// query-рядків не підтримує.

import { getRoutes, navigate } from "../router.js";
import { renderAccountMenu } from "./AccountMenu.js";
import { setPendingSearchQuery } from "../pages/search.js";
import { searchTasks } from "../store/taskStore.js";

const AUTH_PATH = "/auth";
const SUGGESTION_LIMIT = 6;
const DEBOUNCE_MS = 280;

// Мінімальні лінійні іконки (20×20, stroke: currentColor) — той самий
// стиль, що й TRASH_ICON_SVG у TaskCard.js: жодної зовнішньої
// бібліотеки іконок, усе саморобне й узгоджене з рештою застосунку.
const ROUTE_ICONS = {
  "/inbox": `<path d="M3 11l1.6-5.4A1 1 0 0 1 5.55 5h8.9a1 1 0 0 1 .95.6L17 11M3 11v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4M3 11h3.8l1 1.8h4.4l1-1.8H17" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" fill="none"/>`,
  "/list/next": `<path d="M4 5.5h2M4 10h2M4 14.5h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8.5 5.5H16M8.5 10H16M8.5 14.5H16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  "/board": `<rect x="3" y="4" width="4" height="12" rx="1.2" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="8" y="4" width="4" height="8" rx="1.2" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="13" y="4" width="4" height="10" rx="1.2" stroke="currentColor" stroke-width="1.4" fill="none"/>`,
  "/list/read_watch": `<path d="M10 6.2c-1.3-1-3.1-1.4-5-1.2v9.6c1.9-0.2 3.7 0.2 5 1.2 1.3-1 3.1-1.4 5-1.2V5c-1.9-0.2-3.7 0.2-5 1.2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/><path d="M10 6.2v9.6" stroke="currentColor" stroke-width="1.3"/>`,
  "/list/someday": `<path d="M13.8 11.6A6 6 0 116.4 4.2a6 6 0 007.4 7.4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/>`,
  "/history": `<circle cx="10" cy="10" r="6.8" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M10 6.5V10l2.6 1.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  "/feed": `<circle cx="4.5" cy="15.5" r="1.5" fill="currentColor"/><path d="M4.5 10.2a5.3 5.3 0 015.3 5.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M4.5 5.5A10 10 0 0114.5 15.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
};

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
    <div class="nav__mobile-bar">
      <button type="button" class="nav__burger" aria-label="Відкрити меню" aria-expanded="false" aria-controls="nav-menu">
        <span aria-hidden="true">☰</span>
      </button>
      <a href="/inbox" data-link class="nav__mobile-brand">Mini GTD</a>
    </div>

    <div class="nav__panel" id="nav-menu">
      <a href="/inbox" data-link class="nav__brand">Mini GTD</a>

      <ul class="nav__links">
        ${routes
          .map(
            (route) => `
          <li>
            <a href="${route.path}" data-link data-path="${route.path}" class="nav__link">
              <span class="nav__link-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">${ROUTE_ICONS[route.path] ?? ""}</svg>
              </span>
              <span class="nav__link-label">${route.title}</span>
            </a>
          </li>
        `
          )
          .join("")}
      </ul>

      <div class="nav__spacer"></div>

      <span class="nav__divider" aria-hidden="true"></span>

      <button type="button" class="nav__search-toggle" aria-expanded="false" aria-controls="nav-search-panel">
        ${SEARCH_ICON_SVG}
        <span class="nav__search-toggle-label">Пошук</span>
      </button>

      <div class="nav__account-slot"></div>
    </div>
    <div class="nav__overlay"></div>

    <div class="nav__search-backdrop"></div>
    <div class="nav__search-panel" id="nav-search-panel">
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

// Кнопка-лупа: клік розкриває поле окремою виринаючою панеллю по
// центру екрана (fixed, поза бічною навігацією — коментар на
// початку файлу); під час набору (з дебаунсом — не смикати базу на
// кожну літеру) — випадний список до SUGGESTION_LIMIT збігів, клік
// по одному одразу відкриває задачу. Enter/сабміт форми — повний
// список на /search.
function wireSearch(root) {
  const toggle = root.querySelector(".nav__search-toggle");
  const backdrop = root.querySelector(".nav__search-backdrop");
  const panel = root.querySelector(".nav__search-panel");
  const form = root.querySelector(".nav__search-form");
  const input = root.querySelector(".nav__search-input");
  const suggestionsEl = root.querySelector(".nav__search-suggestions");

  let debounceTimer = null;
  let requestId = 0; // застаріла відповідь (повільніший попередній запит) не має перезаписати свіжішу
  let isOpen = false;

  function clearSuggestions() {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = "";
  }

  function openSearch() {
    isOpen = true;
    backdrop.classList.add("is-open");
    panel.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    input.focus();
  }

  function closeSearch() {
    isOpen = false;
    backdrop.classList.remove("is-open");
    panel.classList.remove("is-open");
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
    if (isOpen) closeSearch();
    else openSearch();
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

  // Бекдроп на весь екран — вище за все інше (z-index), тож клік
  // будь-де поза панеллю (включно з рештою бічної навігації) спершу
  // влучає саме в нього; окремого document-слухача "клік поза
  // .nav__search" більше не треба.
  backdrop.addEventListener("click", closeSearch);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) closeSearch();
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
