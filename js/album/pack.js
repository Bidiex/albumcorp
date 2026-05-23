/**
 * pack.js — Reveal de sobres con GSAP
 */
import { supabase } from '../core/supabase.js';
import { renderSticker } from './stickers.js';
import { gsap } from 'gsap';

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
  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.className = 'pack-overlay';
  overlay.innerHTML = `
    <div class="pack-video-container">
      <video class="pack-video" src="/0518.mp4" autoplay playsinline></video>
    </div>
    <div class="pack-stickers"></div>
    <button class="pack-close">Cerrar</button>
  `;
  document.body.appendChild(overlay);

  const videoContainer = overlay.querySelector('.pack-video-container');
  const video          = overlay.querySelector('.pack-video');
  const stickersWrap   = overlay.querySelector('.pack-stickers');
  const closeBtn       = overlay.querySelector('.pack-close');

  // Ocultar elementos hasta que los necesitemos
  gsap.set(stickersWrap, { display: 'none', opacity: 0 });
  gsap.set(closeBtn,     { opacity: 0, pointerEvents: 'none' });

  // Autoplay con fallback por seguridad
  video.play().catch(err => {
    console.log("Autoplay con sonido bloqueado, reproduciendo silenciado:", err);
    video.muted = true;
    video.play();
  });

  // ── Fase 1: fade in overlay ──
  gsap.fromTo(overlay,
    { opacity: 0 },
    { opacity: 1, duration: 0.4, ease: 'power2.out',
      onComplete: () => overlay.classList.add('visible') }
  );

  // ── Gestión del flujo del video (Ended / Skip on click) ──
  let skipped = false;
  function skipVideo() {
    if (skipped) return;
    skipped = true;
    
    // Pausar y remover eventos para evitar disparos múltiples
    video.pause();
    
    gsap.to(videoContainer, {
      opacity: 0,
      scale: 0.8,
      duration: 0.35,
      ease: 'power2.in',
      onComplete: () => {
        videoContainer.style.display = 'none';
        gsap.set(stickersWrap, { display: 'flex' });
        gsap.to(stickersWrap, { opacity: 1, duration: 0.35 });
        revealCards();
      }
    });
  }

  video.addEventListener('ended', skipVideo);
  videoContainer.addEventListener('click', skipVideo);

  function revealCards() {
    stickers.forEach((sticker, index) => {
      const emp = {
        ...sticker,
        id:        sticker.id || sticker.employee_id,
        name:      sticker.name || sticker.employee_name || '?',
        role:      sticker.role || sticker.employee_role || '',
        photo_url: sticker.photo_url || null,
      };

      // Wrapper externo — contiene todo: badge rareza + flip + badge estado + botón
      const card = document.createElement('div');
      card.className = 'pack-sticker-card';

      // Badge rareza — ARRIBA del flip, fuera de él
      const rarityBadge = document.createElement('span');
      rarityBadge.className = `pack-rarity-badge pack-rarity-badge--${emp.rarity || 'common'}`;
      rarityBadge.textContent =
        emp.rarity === 'legendary' ? 'Legendaria' :
        emp.rarity === 'rare'      ? 'Mítica'     : 'Común';

      // Wrapper relativo para contener el flip y el glow detrás
      const cardWrapper = document.createElement('div');
      cardWrapper.style.position = 'relative';
      cardWrapper.style.width = '180px';
      cardWrapper.style.height = '240px';

      // Elemento separado para el glow (detrás de la carta)
      const cardGlow = document.createElement('div');
      cardGlow.className = 'pack-card-glow';
      cardGlow.style.position = 'absolute';
      cardGlow.style.inset = '0';
      cardGlow.style.borderRadius = '10px';
      cardGlow.style.zIndex = '0';
      cardGlow.style.pointerEvents = 'none';

      // Contenedor del flip
      const cardInner = document.createElement('div');
      cardInner.className = 'pack-card-inner';
      cardInner.style.zIndex = '1';

      // Cara trasera — vacía, solo color/gradiente, sin emoji
      const cardBack = document.createElement('div');
      cardBack.className = 'pack-card-face pack-card-back';

      // Cara delantera — solo la laminita, sin badges ni botones encima
      const cardFront = document.createElement('div');
      cardFront.className = 'pack-card-face pack-card-front';
      cardFront.innerHTML = renderSticker(emp, true);

      cardInner.appendChild(cardBack);
      cardInner.appendChild(cardFront);

      cardWrapper.appendChild(cardGlow);
      cardWrapper.appendChild(cardInner);

      // Badge nuevo/repetido — DEBAJO del flip, fuera de él
      const statusBadge = document.createElement('span');
      statusBadge.className = `pack-badge ${sticker.is_new ? 'pack-badge--new' : 'pack-badge--repeat'}`;
      statusBadge.textContent = sticker.is_new ? '¡Nueva!' : 'Repetida';

      card.appendChild(rarityBadge);
      card.appendChild(cardWrapper);
      card.appendChild(statusBadge);

      // Botón pegar — DEBAJO del badge, fuera del flip, solo si es nueva
      if (sticker.is_new) {
        const pasteBtn = document.createElement('button');
        pasteBtn.className = 'pack-paste-btn';
        pasteBtn.textContent = '📌 Pegar en álbum';
        pasteBtn.dataset.empId = emp.id;
        pasteBtn.onclick = async (e) => {
          e.stopPropagation();
          pasteBtn.disabled = true;
          pasteBtn.textContent = 'Pegando...';
          const { error } = await supabase.rpc('fn_paste_sticker', {
            p_employee_id: emp.id
          });
          if (!error) {
            pasteBtn.textContent = '✓ Pegada';
            pasteBtn.classList.add('pack-paste-btn--done');
          } else {
            pasteBtn.disabled = false;
            pasteBtn.textContent = '📌 Pegar en álbum';
          }
        };
        card.appendChild(pasteBtn);
      }

      stickersWrap.appendChild(card);

      // Animación entrada + flip con GSAP
      gsap.fromTo(card,
        { opacity: 0, y: 50, scale: 0.8 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 0.45,
          delay: index * 0.2,
          ease: 'back.out(1.4)',
          onComplete: () => {
            gsap.to(cardInner, {
              rotateY: 180,
              duration: 0.55,
              delay: 0.1,
              ease: 'power2.inOut',
              onComplete: () => {
                // Glow en cardGlow después del flip, usando box-shadow para evitar repaints del hijo
                if (emp.rarity === 'legendary') {
                  gsap.to(cardGlow, {
                    boxShadow: '0 0 16px #F59E0B, 0 0 32px #F59E0B88',
                    duration: 0.5,
                    yoyo: true,
                    repeat: -1,
                    ease: 'sine.inOut'
                  });
                } else if (emp.rarity === 'rare') {
                  gsap.to(cardGlow, {
                    boxShadow: '0 0 12px #7C3AED, 0 0 24px #7C3AED88',
                    duration: 0.6,
                    yoyo: true,
                    repeat: -1,
                    ease: 'sine.inOut'
                  });
                }
                // Mostrar botón cerrar tras último flip
                if (index === stickers.length - 1) {
                  gsap.to(closeBtn, {
                    opacity: 1,
                    delay: 0.5,
                    duration: 0.3,
                    onStart: () => { closeBtn.style.pointerEvents = 'auto'; }
                  });
                }
              }
            });
          }
        }
      );
    });
  }

  // ── Cerrar ──
  closeBtn.addEventListener('click', () => {
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        overlay.remove();
        onComplete(stickers);
      }
    });
  });
}

function showToast(message) {
  const existing = document.querySelector('.pack-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'pack-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('pack-toast--visible'));

  setTimeout(() => {
    toast.classList.remove('pack-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
