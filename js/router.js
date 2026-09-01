// Маршрутизація на клієнті (History API, без бібліотек).
// Відповідає лише за визначення поточного маршруту, перевірку
// доступу (protected-маршрути) й виклик рендеру відповідної
// сторінки — бізнес-логіка списків задач тут не живе
// (див. PROJECT_RULES.md, п.6).

import { renderInbox } from "./pages/inbox.js";
import { renderNext } from "./pages/next.js";
import { renderReadWatch } from "./pages/readWatch.js";
import { renderSomeday } from "./pages/someday.js";
import { renderHistory } from "./pages/history.js";
import { renderSearch } from "./pages/search.js";
import { renderBoard } from "./pages/board.js";
import { renderTaskDetail } from "./pages/taskDetail.js";
import { renderTrash } from "./pages/trash.js";
import { renderSources } from "./pages/sources.js";
import { renderFeed } from "./pages/feed.js";
import { renderIntegrations } from "./pages/integrations.js";
import { renderAuth } from "./pages/auth.js";
import { getSession } from "./store/authStore.js";
import { FEATURES } from "./config.js";

const DEFAULT_PATH = "/inbox";
const AUTH_PATH = "/auth";

const ALL_ROUTES = [
  { path: "/auth", title: "Вхід", render: renderAuth, protected: false, bare: true },
  { path: "/inbox", title: "Вхідні", render: renderInbox, protected: true },
  { path: "/list/next", title: "Задачі", render: renderNext, protected: true },
  { path: "/board", title: "Дошка", render: renderBoard, protected: true, wide: true },
  { path: "/task/:id", title: "Задача", render: renderTaskDetail, protected: true },
  { path: "/list/read_watch", title: "Читати / Дивитись", render: renderReadWatch, protected: true },
  { path: "/list/someday", title: "Колись", render: renderSomeday, protected: true },
  { path: "/history", title: "Історія", render: renderHistory, protected: true },
  // feature: "feed" — маршрут існує лише коли FEATURES.feed === true
  // (js/config.js). Вимкнено — і «Стрічка», і «Джерела» зникають із
  // навігації, а прямий перехід на них редіректить на «Вхідні»
  // (matchRoute їх просто не знаходить). Код сторінок і сторів
  // лишається на місці — це вимикач, не видалення.
  { path: "/feed", title: "Стрічка", render: renderFeed, protected: true, feature: "feed" },
  // hideFromNav — маршрут доступний (посилання, кнопки), але не
  // захаращує головне меню; потрапити на нього можна лише з меню
  // акаунта (AccountMenu.js) — той самий принцип, що вже є для
  // динамічних маршрутів (/task/:id) нижче в getRoutes(). «Джерела»
  // й «Кошик» — за проханням користувача, менше вкладок на видноті.
  { path: "/sources", title: "Джерела", render: renderSources, protected: true, hideFromNav: true, feature: "feed" },
  { path: "/trash", title: "Кошик", render: renderTrash, protected: true, hideFromNav: true },
  { path: "/integrations", title: "Інтеграції", render: renderIntegrations, protected: true, hideFromNav: true },
  // Потрапити можна лише через поле пошуку в Nav.js (setPendingSearchQuery
  // + navigate) — не окрема вкладка меню.
  { path: "/search", title: "Пошук", render: renderSearch, protected: true, hideFromNav: true },
];

// Активні маршрути — без тих, чия фіча вимкнена в js/config.js.
// Усе далі (matchRoute, getRoutes) працює лише з цим списком, тож
// вимкнений маршрут для роутера просто не існує.
const ROUTES = ALL_ROUTES.filter((route) => !route.feature || FEATURES[route.feature]);

let pageRoot = null;
let onRouteChange = null;

// Лише protected-маршрути йдуть у меню навігації — /auth туди не
// потрапляє, так само як і динамічні («/task/:id» — на нього
// потрапляють кліком по задачі, а не з меню).
export function getRoutes() {
  return ROUTES.filter((route) => route.protected && !route.path.includes(":") && !route.hideFromNav);
}

// Найпростіший матчинг динамічних сегментів (":id" тощо) — без
// повноцінної бібліотеки роутера, лише те, що реально потрібно:
// один параметр у /task/:id. Статичні маршрути звіряються прямим
// рядковим порівнянням, як і раніше.
function matchRoute(pathname) {
  const pathParts = pathname.split("/");

  for (const route of ROUTES) {
    if (!route.path.includes(":")) {
      if (route.path === pathname) return { route, params: {} };
      continue;
    }

    const routeParts = route.path.split("/");
    if (routeParts.length !== pathParts.length) continue;

    const params = {};
    const matched = routeParts.every((part, i) => {
      if (part.startsWith(":")) {
        params[part.slice(1)] = decodeURIComponent(pathParts[i]);
        return true;
      }
      return part === pathParts[i];
    });

    if (matched) return { route, params };
  }

  return null;
}

function fallbackPath() {
  return getSession() ? DEFAULT_PATH : AUTH_PATH;
}

// async — сторінки на реальних даних (напр. /inbox) чекають на
// відповідь бази, перш ніж їх можна показати.
async function renderCurrentRoute() {
  const pathname = window.location.pathname;

  if (pathname === "/") {
    await navigate(fallbackPath(), { replace: true });
    return;
  }

  const matched = matchRoute(pathname);

  if (!matched) {
    await navigate(fallbackPath(), { replace: true });
    return;
  }

  const { route, params } = matched;

  const authenticated = Boolean(getSession());

  // Захищений маршрут без сесії — на логін.
  if (route.protected && !authenticated) {
    await navigate(AUTH_PATH, { replace: true });
    return;
  }

  // Уже залогінений і намагається відкрити /auth — у застосунок.
  if (route.path === AUTH_PATH && authenticated) {
    await navigate(DEFAULT_PATH, { replace: true });
    return;
  }

  document.title = `${route.title} — Mini GTD`;
  pageRoot.className = ["page", route.bare && "page--auth", route.wide && "page--wide"]
    .filter(Boolean)
    .join(" ");
  await route.render(pageRoot, params);
  playEnterTransition(pageRoot);

  if (onRouteChange) onRouteChange(route.path);
}

// Перезапускає CSS-анімацію появи сторінки (.page--enter) при
// кожному переході. Просто додати клас вдруге браузер проігнорує
// (він уже доданий) — знімаємо його, примусово читаємо layout
// (forced reflow), тоді додаємо знову.
function playEnterTransition(root) {
  root.classList.remove("page--enter");
  void root.offsetWidth;
  root.classList.add("page--enter");
}

export async function navigate(path, { replace = false } = {}) {
  const samePath = window.location.pathname === path;

  if (!samePath) {
    if (replace) {
      window.history.replaceState({}, "", path);
    } else {
      window.history.pushState({}, "", path);
    }
  }

  await renderCurrentRoute();
}

// root — куди рендерити сторінки; routeChangeCallback — сповіщає
// навігацію (Nav.js), який пункт меню активний і чи показувати
// саму навігацію (на /auth вона прихована).
export function initRouter(root, routeChangeCallback) {
  pageRoot = root;
  onRouteChange = routeChangeCallback || null;

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link) return;

    event.preventDefault();
    navigate(link.getAttribute("href")).catch((err) => console.error("Помилка переходу:", err));
  });

  window.addEventListener("popstate", () => {
    renderCurrentRoute().catch((err) => console.error("Помилка переходу:", err));
  });

  renderCurrentRoute().catch((err) => console.error("Помилка початкового рендеру:", err));
}
