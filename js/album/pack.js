/**
 * pack.js — Lógica para abrir sobres y gestionar nuevos stickers
 */
import { supabase } from '../core/supabase.js';
import { renderSticker } from './stickers.js';

export async function openPack(profile, onComplete) {
  const btn = document.getElementById('btn-open-pack');
  if (btn) btn.disabled = true;

  try {
    const { data, error } = await supabase.rpc('fn_open_pack', {
      p_user_id: profile.id,
      p_company_id: profile.company_id
    });

    if (error) {
      if (error.code === 'P0001' && error.message?.includes('NO_PACKS_AVAILABLE')) {
        showToast('No tienes sobres disponibles');
      } else {
        console.error('Error abriendo sobre:', error);
        showToast('Error al abrir el sobre. Intenta de nuevo.');
      }
      return;
    }

    console.log('[pack.js] RPC fn_open_pack response:', data);
    const stickers = Array.isArray(data) ? data : data?.stickers;
    if (!stickers || stickers.length === 0) {
      showToast('El sobre estaba vacío. Intenta de nuevo.');
      return;
    }

    showPackReveal(stickers, onComplete);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function showPackReveal(stickers, onComplete) {
  // Crear overlay
  const overlay = document.createElement('div');
  overlay.className = 'pack-overlay';

  overlay.innerHTML = `
    <div class="pack-envelope">
      <div class="pack-envelope__body">🎴</div>
      <div class="pack-envelope__flap"></div>
    </div>
    <div class="pack-stickers" style="display:none"></div>
    <button class="pack-close">¡Continuar!</button>
  `;

  document.body.appendChild(overlay);

  const envelope = overlay.querySelector('.pack-envelope');
  const stickersContainer = overlay.querySelector('.pack-stickers');
  const closeBtn = overlay.querySelector('.pack-close');

  // Fase 1: fade in (0ms)
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  // Fase 2: abrir sobre (800ms)
  setTimeout(() => {
    envelope.classList.add('pack-envelope--open');
  }, 800);

  // Fase 3: ocultar sobre, mostrar contenedor stickers (1500ms)
  setTimeout(() => {
    envelope.style.display = 'none';
    stickersContainer.style.display = 'flex';
  }, 1500);

  // Fase 4: revelar stickers uno a uno cada 350ms
  stickers.forEach((sticker, index) => {
    setTimeout(() => {
      const card = document.createElement('div');
      card.className = 'pack-sticker-card';
      if (sticker.rarity === 'legendary') {
        card.classList.add('sticker--legendary');
      }

      const badge = document.createElement('span');
      badge.className = `pack-badge ${sticker.is_new ? 'pack-badge--new' : 'pack-badge--repeat'}`;
      badge.textContent = sticker.is_new ? '¡Nuevo!' : 'Repetido';

      // Normalizar campos: la RPC puede devolver employee_id en lugar de id
      const employeeData = {
        ...sticker,
        id: sticker.id || sticker.employee_id,
        name: sticker.name || sticker.employee_name || '?',
        role: sticker.role || sticker.employee_role || '',
        photo_url: sticker.photo_url || null,
      };
      const stickerHtml = renderSticker(employeeData, true);
      card.innerHTML = stickerHtml;
      card.insertAdjacentElement('afterbegin', badge);

      // Botón Pegar (solo stickers nuevos)
      if (sticker.is_new) {
        const pasteBtn = document.createElement('button');
        pasteBtn.className = 'pack-paste-btn';
        pasteBtn.textContent = '📌 Pegar en álbum';
        pasteBtn.onclick = async (e) => {
          e.stopPropagation();
          pasteBtn.disabled = true;
          pasteBtn.textContent = 'Pegando...';
          const empId = sticker.employee_id || sticker.id;
          const { error } = await supabase.rpc('fn_paste_sticker', { p_employee_id: empId });
          if (!error) {
            pasteBtn.textContent = '✓ Pegado';
            pasteBtn.classList.add('pack-paste-btn--done');
          } else {
            pasteBtn.disabled = false;
            pasteBtn.textContent = '📌 Pegar en álbum';
          }
        };
        card.appendChild(pasteBtn);
      }

      stickersContainer.appendChild(card);

      // Trigger animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          card.classList.add('revealed');
        });
      });

      // Fase 5: tras último sticker + 500ms, mostrar botón cerrar
      if (index === stickers.length - 1) {
        setTimeout(() => {
          closeBtn.classList.add('visible');
        }, 500);
      }
    }, 1500 + index * 350);
  });

  // Botón cerrar
  closeBtn.addEventListener('click', () => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      onComplete(stickers);
    }, 300);
  });
}

function showToast(message) {
  const existing = document.querySelector('.pack-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'pack-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('pack-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('pack-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
