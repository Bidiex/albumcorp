// js/editor/mobile-nav.js
document.addEventListener('DOMContentLoaded', () => {
  const btnMenu = document.getElementById('btn-mobile-menu');
  const sidebar = document.querySelector('.editor-sidebar');
  
  // Crear backdrop si no existe ya
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const openMenu = () => {
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
  };

  const closeMenu = () => {
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = ''; // Restaurar scroll
  };

  if (btnMenu) {
    btnMenu.addEventListener('click', openMenu);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeMenu);
  }

  // Cerrar al pulsar opciones del menú (navegación)
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', closeMenu);
  });

  // Cerrar al pulsar cerrar sesión
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', closeMenu);
  }
});
