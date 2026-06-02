/**
 * Escapa caracteres HTML peligrosos para prevenir XSS.
 * @param {string} str - El texto a escapar.
 * @returns {string} El texto escapado.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const s = typeof str === 'string' ? str : String(str);
  return s.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}
