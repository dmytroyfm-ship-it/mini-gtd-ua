// Сторінка логіну (/auth). Якщо користувач уже авторизований,
// router.js на цей маршрут не пустить — перенаправить на /inbox
// раніше, ніж викличеться цей рендер.
//
// Вхід — редірект на Google: signInWithGoogle() лише запускає
// перехід, сама сесія з'являється вже після повернення сюди
// свіжим завантаженням сторінки (router.js побачить сесію й сам
// перенаправить на /inbox) — тому додаткового navigate() тут нема.

import { signInWithGoogle, consumeAuthError } from "../store/authStore.js";
import { renderAuthCard } from "../components/AuthCard.js";

export function renderAuth(root) {
  root.innerHTML = "";
  root.appendChild(renderAuthCard(signInWithGoogle, consumeAuthError()));
}
