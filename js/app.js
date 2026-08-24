// Точка входу застосунку: чекає перевірки сесії Supabase, тоді
// монтує навігацію та ініціалізує роутер. Порядок важливий — без
// очікування initAuth() перший рендер міг би на мить показати
// /auth навіть залогіненому користувачу.

import { mountNav, refreshNav } from "./components/Nav.js";
import { initRouter } from "./router.js";
import { initAuth } from "./store/authStore.js";

document.addEventListener("DOMContentLoaded", async () => {
  const navRoot = document.getElementById("nav-root");
  const pageRoot = document.getElementById("page-root");

  await initAuth();

  mountNav(navRoot);
  initRouter(pageRoot, refreshNav);
});
