// Картка Telegram-інтеграції (сторінка /integrations): показує
// статус прив'язки й керує нею. Сам вантажить і оновлює свої дані
// (getTelegramLink/generateLinkCode/unlinkTelegram) — той самий
// підхід, що й MaterialsBlock.js (PROJECT_RULES, п.6 — бізнес-
// логіка в store, не тут).
//
// Саму прив'язку (заповнення telegram_chat_id) робить не ця
// картка, а бот — після /start <код> Edge Function сама записує
// результат у базу. Картка лише показує поточний стан і дозволяє
// згенерувати новий код чи відв'язати акаунт.

import { getTelegramLink, generateLinkCode, unlinkTelegram } from "../store/telegramStore.js";
import { TELEGRAM_BOT_USERNAME } from "../config.js";

function escapeHtml(value) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

export function renderIntegrationsCard() {
  const wrapper = document.createElement("div");
  wrapper.className = "integrations-card";
  wrapper.innerHTML = `<p class="page__text">Завантаження…</p>`;

  async function refresh() {
    let link;
    try {
      link = await getTelegramLink();
    } catch (err) {
      console.error(err);
      wrapper.innerHTML = `<p class="page__text">Не вдалося завантажити статус інтеграції. Спробуйте оновити сторінку.</p>`;
      return;
    }

    if (link?.telegram_chat_id) {
      renderLinked(link);
    } else if (link?.link_code && link.link_code_expires_at && new Date(link.link_code_expires_at) > new Date()) {
      renderPendingCode(link);
    } else {
      renderDisconnected();
    }
  }

  function renderDisconnected() {
    wrapper.innerHTML = `
      <div class="integrations-card__status">
        <span class="integrations-card__badge integrations-card__badge--off">Не прив'язано</span>
      </div>
      <p class="integrations-card__text">
        Прив'яжи Telegram, щоб додавати задачі в «Вхідні» просто повідомленням боту — текстом чи голосом.
      </p>
      <button type="button" class="integrations-card__button">Згенерувати код прив'язки</button>
    `;

    wrapper.querySelector(".integrations-card__button").addEventListener("click", handleGenerate);
  }

  function renderPendingCode(link) {
    const deepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${link.link_code}`;

    wrapper.innerHTML = `
      <div class="integrations-card__status">
        <span class="integrations-card__badge integrations-card__badge--pending">Очікує підтвердження</span>
      </div>
      <p class="integrations-card__text">
        Код дійсний до ${formatTime(link.link_code_expires_at)}. Перейди за посиланням нижче
        (відкриє Telegram і сам підставить код) або встав код вручну командою
        <code class="integrations-card__code-inline">/start ${escapeHtml(link.link_code)}</code> в чаті з ботом.
      </p>
      <a class="integrations-card__button integrations-card__button--link" href="${deepLink}" target="_blank" rel="noopener noreferrer">
        Відкрити бота з кодом ${escapeHtml(link.link_code)}
      </a>
      <button type="button" class="integrations-card__button integrations-card__button--ghost">Згенерувати новий код</button>
    `;

    wrapper
      .querySelector(".integrations-card__button--ghost")
      .addEventListener("click", handleGenerate);
  }

  function renderLinked(link) {
    const label = link.telegram_username
      ? `@${escapeHtml(link.telegram_username)}`
      : link.telegram_first_name
        ? escapeHtml(link.telegram_first_name)
        : "Telegram-акаунт";

    wrapper.innerHTML = `
      <div class="integrations-card__status">
        <span class="integrations-card__badge integrations-card__badge--on">Прив'язано</span>
        <span class="integrations-card__account">${label}</span>
      </div>
      <p class="integrations-card__text">
        Надсилай боту текст або голосове повідомлення — задача одразу з'явиться у «Вхідних».
      </p>
      <button type="button" class="integrations-card__button integrations-card__button--danger">Відв'язати</button>
    `;

    wrapper
      .querySelector(".integrations-card__button--danger")
      .addEventListener("click", handleUnlink);
  }

  async function handleGenerate(event) {
    const button = event.currentTarget;
    button.disabled = true;

    try {
      await generateLinkCode();
      await refresh();
    } catch (err) {
      console.error(err);
      button.disabled = false;
      window.alert("Не вдалося згенерувати код. Спробуйте ще раз.");
    }
  }

  async function handleUnlink(event) {
    const confirmed = window.confirm("Відв'язати Telegram? Бот перестане додавати задачі, доки не прив'яжеш акаунт знову.");
    if (!confirmed) return;

    const button = event.currentTarget;
    button.disabled = true;

    try {
      await unlinkTelegram();
      await refresh();
    } catch (err) {
      console.error(err);
      button.disabled = false;
      window.alert("Не вдалося відв'язати акаунт. Спробуйте ще раз.");
    }
  }

  refresh();

  return wrapper;
}
