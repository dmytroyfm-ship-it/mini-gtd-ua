// Тема оформлення (світла/темна) — застосунок навмисно темний за
// замовчуванням (дизайн-рішення з самого початку, css/style.css) і
// лишається таким, поки користувач сам не перемкне; system-
// налаштування ОС свідомо не читаємо тут (простіше й передбачувано —
// одне явне джерело істини). Зберігається в localStorage (не в
// user_metadata, як фото/фон, — тема має застосуватись ДО того, як
// прийде відповідь Supabase, інакше на кожному завантаженні був би
// помітний спалах не тієї теми; index.html містить крихітний inline-
// скрипт, що читає той самий ключ синхронно ще до першого рендеру).

const STORAGE_KEY = "mini-gtd-theme";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // приватний режим тощо — тиха відмова, лишаємось на темній
  }
}

function writeStored(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // немає доступу до localStorage — тема просто не переживе перезавантаження
  }
}

export function getTheme() {
  return readStored() === "light" ? "light" : "dark";
}

function apply(theme) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
}

export function setTheme(theme) {
  writeStored(theme);
  apply(theme);
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

// Викликається один раз при старті (app.js) — index.html вже
// застосував тему синхронно (inline-скрипт) до першого пофарбованого
// пікселя, це лише синхронізує dataset.theme із тим самим значенням
// про всяк випадок (напр. якщо inline-скрипт колись розійдеться з
// цією логікою).
export function initTheme() {
  apply(getTheme());
}
