// Автентифікація через Supabase Auth (реальний Google OAuth).
//
// Вхід — редірект-флоу: signInWithGoogle() лише запускає перехід
// на сторінку Google, сама сесія з'являється вже після повернення
// назад на /auth свіжим завантаженням сторінки. Тому getSession()
// навмисно синхронний і читає закешоване значення — router.js і
// Nav.js як і раніше можуть звертатись до нього без await; кеш
// оновлюється через supabase.auth.onAuthStateChange.

import { supabase } from "../lib/supabaseClient.js";

let session = null;
let readyPromise = null;

function applySession(nextSession) {
  session = nextSession
    ? { id: nextSession.user.id, email: nextSession.user.email }
    : null;
}

// Викликати один раз при старті застосунку — чекає, поки Supabase
// перевірить наявну сесію (сховище браузера / повернення з Google),
// перш ніж router.js зробить перший рендер. Без цього очікування
// перший рендер міг би побачити getSession() === null і на мить
// показати /auth навіть залогіненому користувачу.
export function initAuth() {
  if (readyPromise) return readyPromise;

  readyPromise = supabase.auth.getSession().then(({ data }) => {
    applySession(data.session);
  });

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    applySession(nextSession);
  });

  return readyPromise;
}

export function getSession() {
  return session;
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth`,
      // Без цього Google, якщо в браузері вже є активна сесія,
      // мовчки підтверджує той самий акаунт замість показу вибору
      // (signOut() виходить лише із Supabase, не з самого Google) —
      // prompt=select_account примусово показує екран вибору
      // акаунта щоразу.
      queryParams: { prompt: "select_account" },
    },
  });

  // Якщо помилки нема — браузер уже переходить на Google, сюди
  // виконання не повертається.
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  applySession(null);
}

// Google/Supabase повертають користувача на /auth з ?error=... у
// query-рядку, якщо вхід не вдався чи його скасували. Перевіряємо
// один раз і одразу прибираємо параметри з адресного рядка, щоб та
// сама помилка не показувалась знову при звичайному оновленні
// сторінки.
export function consumeAuthError() {
  const params = new URLSearchParams(window.location.search);
  const description = params.get("error_description") || params.get("error");

  if (!description) return null;

  // Сам текст від Google/Supabase — англійською; користувачу
  // показуємо українську версію, оригінал лишається лише в консолі
  // для діагностики.
  console.error("Помилка входу через Google:", description.replace(/\+/g, " "));

  window.history.replaceState({}, "", window.location.pathname);
  return "Не вдалося увійти через Google. Спробуйте ще раз.";
}
