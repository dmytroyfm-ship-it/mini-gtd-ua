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
const listeners = new Set();

// Підписка на будь-яку зміну сесії (AccountMenu.js) — потрібна,
// бо syncGoogleAvatar() нижче оновлює сесію асинхронно, вже після
// того, як сторінка й меню акаунта могли встигнути відрендеритись
// без фото; без цього фото з'явилось би лише після наступного
// переходу між сторінками (refreshNav викликається лише тоді).
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function applySession(nextSession) {
  if (!nextSession) {
    session = null;
  } else {
    // Ім'я й фото — з Google-профілю (Supabase кладе їх у
    // user_metadata після OAuth-логіну) або, якщо користувач сам
    // задав своє ім'я через updateDisplayName()/фото через
    // syncGoogleAvatar(), звідти — теж лежить у тому самому
    // user_metadata, нових полів не треба.
    const metadata = nextSession.user.user_metadata || {};
    session = {
      id: nextSession.user.id,
      email: nextSession.user.email,
      name: metadata.full_name || metadata.name || null,
      avatarUrl: metadata.avatar_url || metadata.picture || null,
    };
  }

  listeners.forEach((callback) => callback());
}

// Відомий баг Supabase (GoTrue інколи не переносить "picture" від
// Google в user_metadata.avatar_url — обговорення supabase/supabase
// #2167, #4047): обходимо його самі. provider_token — це реальний
// access-токен Google, короткочасно доступний лише в самій події
// SIGNED_IN (Supabase його ніде не зберігає, після перезавантаження
// сторінки він уже недоступний) — використовуємо його рівно один
// раз одразу після входу, щоб напряму запитати профіль у Google
// (userinfo-ендпоінт, той самий "profile" scope, що вже й так
// запитаний у signInWithGoogle()) і дописати фото в user_metadata
// самостійно, через звичайний updateUser().
async function syncGoogleAvatar(providerToken) {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!res.ok) return;

    const profile = await res.json();
    if (!profile.picture) return;

    const { data, error } = await supabase.auth.updateUser({ data: { avatar_url: profile.picture } });
    if (error) throw error;
    applySession(data.user ? { user: data.user } : null);
  } catch (err) {
    console.error("Не вдалося отримати фото профілю Google:", err);
  }
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

  supabase.auth.onAuthStateChange((event, nextSession) => {
    applySession(nextSession);

    if (event === "SIGNED_IN" && nextSession?.provider_token) {
      syncGoogleAvatar(nextSession.provider_token);
    }
  });

  return readyPromise;
}

export function getSession() {
  return session;
}

// Перезаписує ім'я в меню акаунта (AccountMenu.js) — власним
// значенням, поверх того, що прийшло з Google. supabase.auth
// .updateUser() підмішує { full_name } в user_metadata, не
// замінюючи решту полів (avatar_url лишається як був).
export async function updateDisplayName(name) {
  const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (error) throw error;
  applySession(data.user ? { user: data.user } : null);
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth`,
      // select_account — примусово показує екран вибору акаунта
      // щоразу (signOut() виходить лише із Supabase, не з самого
      // Google). consent — окремо змушує Google по-новому
      // підтвердити самі права доступу; без нього доданий нижче
      // scope "profile" підхоплювався мовчки, без реального
      // перезапиту дозволів, і фото так і не з'являлось.
      queryParams: { prompt: "select_account consent" },
      // Без явного "profile" Google не віддає фото профілю —
      // user_metadata.avatar_url/picture були відсутні.
      scopes: "email profile",
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
