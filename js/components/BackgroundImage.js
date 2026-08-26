// Застосовує власне фонове зображення користувача (session.backgroundUrl,
// authStore.js) на весь застосунок — під час старту (app.js) і при
// кожній зміні сесії (uploadBackground()/resetBackground() у меню
// акаунта, AccountMenu.js). Сам лише читає стан з authStore.js і
// оновлює DOM (#user-bg, index.html) — жодних рішень про
// автентифікацію (PROJECT_RULES, п.6).
//
// Коли фону нема — звичайне вбудоване зоряне небо (css/style.css,
// body::before/::after). Коли є — .user-bg показує фото на весь
// екран (position: fixed, як і вбудований фон), а body отримує
// клас has-custom-bg, який ховає зоряне небо й додає темну
// підкладку поверх фото для читабельності тексту (css/style.css).

import { getSession, subscribe } from "../store/authStore.js";

let bgEl = null;

function apply() {
  if (!bgEl) bgEl = document.getElementById("user-bg");
  if (!bgEl) return;

  const session = getSession();
  const url = session?.backgroundUrl;

  if (url) {
    document.body.classList.add("has-custom-bg");
    bgEl.style.backgroundImage = `url("${url}")`;
  } else {
    document.body.classList.remove("has-custom-bg");
    bgEl.style.backgroundImage = "";
  }
}

export function initBackground() {
  apply();
  subscribe(apply);
}
