/**
 * stickers.js — Lógica de renderizado y estados de los cromos
 */

/**
 * Renderiza el HTML de un sticker basado en el estado de colección
 * @param {Object} employee - Datos del empleado
 * @param {Boolean} isCollected - Si el usuario ya tiene este cromo
 * @returns {String} HTML string
 */
export function renderSticker(employee, isCollected) {
  if (!isCollected) {
    return `
      <div class="sticker sticker--empty">
        <div class="sticker__image-container"></div>
        <div class="sticker__info">
          <div class="sticker__name">?</div>
          <div class="sticker__role"></div>
        </div>
      </div>
    `;
  }

  // Generar iniciales para el placeholder si no hay foto
  const initials = employee.name
    ? employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  // SVG placeholder con iniciales (Data URI)
  const initialsPlaceholder = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23eee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="bold" fill="%23aaa">${initials}</text></svg>`;

  const imageSrc = employee.photo_url || initialsPlaceholder;

  return `
    <div class="sticker">
      <div class="sticker__image-container">
        <img src="${imageSrc}" alt="${employee.name}" class="sticker__image" loading="lazy">
      </div>
      <div class="sticker__info">
        <div class="sticker__name" title="${employee.name}">${employee.name}</div>
        <div class="sticker__role" title="${employee.role || ''}">${employee.role || ''}</div>
      </div>
    </div>
  `;
}
