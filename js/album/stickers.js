/**
 * stickers.js — Lógica de renderizado y estados de los cromos
 */

/**
 * Renderiza el HTML de un sticker basado en el estado de colección
 * @param {Object} employee - Datos del empleado
 * @param {Boolean} isCollected - Si el usuario ya tiene este cromo
 * @param {Boolean} isEager - Si la imagen debe cargar inmediatamente
 * @returns {String} HTML string
 */
export function renderSticker(employee, isCollected, isEager = false) {
  const loadingAttr = isEager ? 'loading="eager"' : 'loading="lazy"';

  if (!isCollected) {
    const placeholderSrc = employee.placeholder_url || '';
    const imgHtml = placeholderSrc ? `<img src="${placeholderSrc}" alt="?" class="sticker__image" ${loadingAttr}>` : '';
    const safeRarity = employee.rarity || 'common';
    
    return `
      <div class="sticker sticker--empty sticker--empty-${safeRarity}" data-employee-id="${employee.id}">
        <div class="sticker__image-container">
          ${imgHtml}
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
  const safeName = (employee.name || '').replace(/'/g, "\\'");
  const safeCode = (employee.code || '').replace(/'/g, "\\'");
  const seniority = employee.seniority_years || 0;
  const safeRarity = employee.rarity || 'common';

  return `
    <div class="sticker" data-employee-id="${employee.id}" 
         onpointerdown="event.stopPropagation();"
         onclick="event.stopPropagation(); window.__showStickerDetails('${imageSrc}', '${safeCode}', ${seniority}, '${safeRarity}')">
      <div class="sticker__image-container">
        <img src="${imageSrc}" alt="Sticker" class="sticker__image" ${loadingAttr}>
      </div>
    </div>
  `;
}

// Global modal function
window.__showStickerDetails = function(imageSrc, code, seniority, rarity) {
  const existing = document.getElementById('sticker-detail-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'sticker-detail-modal';
  backdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 2000;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease; cursor: pointer;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #1e293b; border-radius: 16px; padding: 24px; max-width: 320px; width: 90%;
    display: flex; flex-direction: column; gap: 16px; cursor: default;
    box-shadow: 0 24px 64px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  `;
  modal.onclick = (e) => e.stopPropagation();

  modal.innerHTML = `
    <img src="${imageSrc}" style="width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 12px; background: #eee;">
    <button class="btn btn-ghost" style="width: 100%; justify-content: center; margin-top: 8px;" onclick="document.getElementById('sticker-detail-modal').remove()">Cerrar</button>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  backdrop.onclick = () => backdrop.remove();

  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    modal.style.transform = 'scale(1)';
  });
};
