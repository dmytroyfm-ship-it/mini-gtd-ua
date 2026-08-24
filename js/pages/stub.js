// Спільний рендер для сторінок-заглушок, які ще не реалізовані
// (Наступні, Читати/Дивитись, Колись, Архів, Кошик).

export function renderStub(root, title) {
  root.innerHTML = `
    <h1 class="page__title">${title}</h1>
    <p class="page__text">Ця сторінка буде реалізована пізніше.</p>
  `;
}
