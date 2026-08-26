// Картка сторінки логіну. Сама нічого не знає про сесію чи
// Google API — лише викликає onSignIn і показує результат
// (стан завантаження або помилку). Логіка автентифікації живе в
// js/store/authStore.js (PROJECT_RULES, п.6).

// Іконка "G" — фіксований бренд-логотип Google, тому кольори тут
// навмисно не з дизайн-токенів (це не частина палітри застосунку).
const GOOGLE_ICON_SVG = `
  <svg class="auth-card__google-icon" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.68 9c0-.593.102-1.17.284-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
  </svg>
`;

// initialError — помилка, з якою Google/Supabase вже повернули
// користувача на цю сторінку (наприклад, він скасував вхід). На
// відміну від помилки з кліку кнопки, ця відома одразу при рендері.
export function renderAuthCard(onSignIn, initialError) {
  const card = document.createElement("div");
  card.className = "auth-card";
  card.innerHTML = `
    <h1 class="auth-card__title">Mini GTD</h1>
    <p class="auth-card__subtitle">Увійдіть, щоб почати збирати ідеї та задачі.</p>
    <button type="button" class="auth-card__google">
      ${GOOGLE_ICON_SVG}
      <span class="auth-card__google-label">Увійти через Google</span>
    </button>
    <p class="auth-card__error" ${initialError ? "" : "hidden"}></p>
  `;

  const button = card.querySelector(".auth-card__google");
  const label = card.querySelector(".auth-card__google-label");
  const error = card.querySelector(".auth-card__error");

  if (initialError) {
    error.textContent = initialError;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    label.textContent = "Вхід…";
    error.hidden = true;

    try {
      await onSignIn();
    } catch (err) {
      console.error(err);
      error.textContent = "Не вдалося увійти. Спробуйте ще раз.";
      error.hidden = false;
      button.disabled = false;
      label.textContent = "Увійти через Google";
    }
  });

  return card;
}
