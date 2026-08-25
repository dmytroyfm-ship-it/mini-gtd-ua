// Автентифікація через Supabase Auth (реальний Google OAuth).
//
// Вхід — редірект-флоу: signInWithGoogle() лише запускає перехід
// на сторінку Google, сама сесія з'являється вже після повернення
// назад на /auth свіжим завантаженням сторінки. Тому getSession()
// навмисно синхронний і читає закешоване значення — router.js і
// Nav.js як і раніше можуть звертатись до нього без await; кеш
// оновлюється через supabase.auth.onAuthStateChange.

import { supabase } from "../lib/supabaseClient.js";
import { uploadFile } from "./storageStore.js";

let session = null;
let readyPromise = null;
const listeners = new Set();

// Підписка на будь-яку зміну сесії (AccountMenu.js) — потрібна,
// бо uploadAvatar()/updateDisplayName() змінюють сесію вже після
// першого рендеру меню акаунта; без цього новий стан з'явився б
// лише після наступного переходу між сторінками (refreshNav
// викликається лише тоді).
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function applySession(nextSession) {
  if (!nextSession) {
    session = null;
  } else {
    // Ім'я — з Google-профілю (Supabase кладе full_name/name в
    // user_metadata після OAuth-логіну) або власне, задане через
    // updateDisplayName(). Фото — лише власне, завантажене через
    // uploadAvatar() (Google-фото свідомо не підтягуємо — рішення
    // користувача: простіше й надійніше, ніж обхід бага GoTrue з
    // provider_token, який був тут раніше).
    const metadata = nextSession.user.user_metadata || {};
    session = {
      id: nextSession.user.id,
      email: nextSession.user.email,
      name: metadata.full_name || metadata.name || null,
      avatarUrl: metadata.avatar_url || null,
    };
  }

  listeners.forEach((callback) => callback());
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

// Перезаписує ім'я в меню акаунта (AccountMenu.js) — власним
// значенням, поверх того, що прийшло з Google. supabase.auth
// .updateUser() підмішує { full_name } в user_metadata, не
// замінюючи решту полів (avatar_url лишається як був).
export async function updateDisplayName(name) {
  const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (error) throw error;
  applySession(data.user ? { user: data.user } : null);
}

// Завантажує власне фото в Supabase Storage (бакет user-uploads,
// шлях {user_id}/avatar.<розширення> — той самий файл щоразу
// перезаписується, upsert у storageStore.js) і зберігає публічне
// посилання в user_metadata.avatar_url, як і updateDisplayName()
// вище для імені.
export async function uploadAvatar(file) {
  if (!session) throw new Error("Немає активної сесії — увійдіть ще раз.");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.id}/avatar.${ext}`;
  const publicUrl = await uploadFile(path, file);
  // Той самий шлях перезаписується щоразу (upsert) — без ?v=...
  // браузер міг би далі показувати стару закешовану версію під тим
  // самим URL.
  const avatarUrl = `${publicUrl}?v=${Date.now()}`;

  const { data, error } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
  if (error) throw error;
  applySession(data.user ? { user: data.user } : null);
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
