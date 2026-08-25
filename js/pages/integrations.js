// Сторінка «Інтеграції» (/integrations) — поки що лише Telegram;
// якщо з'являться інші інтеграції, кожна лишиться окремою карткою
// тут (PROJECT_RULES, п.3 — не ускладнювати наперед).

import { renderIntegrationsCard } from "../components/IntegrationsCard.js";

export async function renderIntegrations(root) {
  root.innerHTML = `<h1 class="page__title">Інтеграції</h1>`;
  root.appendChild(renderIntegrationsCard());
}
