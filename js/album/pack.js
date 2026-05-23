/**
 * pack.js — Reveal de sobres con GSAP
 */
import { supabase } from '../core/supabase.js';
import { renderSticker } from './stickers.js';
import { gsap } from 'gsap';

export async function openPack(profile, onComplete, onStickerPasted) {
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

    showPackReveal(stickers, onComplete, onStickerPasted);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function showPackReveal(stickers, onComplete, onStickerPasted) {
  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.className = 'pack-overlay';
  overlay.innerHTML = `
    <div class="pack-video-container">
      <video class="pack-video" src="/0518.mp4" autoplay playsinline></video>
    </div>
    <div class="pack-reveal-wrap">
      <div class="pack-stickers"></div>
      <div class="pack-controls">
        <button class="pack-arrow pack-arrow--prev" aria-label="Anterior">‹</button>
        <div class="pack-indicators"></div>
        <button class="pack-arrow pack-arrow--next" aria-label="Siguiente">›</button>
      </div>
    </div>
    <button class="pack-close">Cerrar</button>
  `;
  document.body.appendChild(overlay);

  const videoContainer = overlay.querySelector('.pack-video-container');
  const video          = overlay.querySelector('.pack-video');
  const revealWrap     = overlay.querySelector('.pack-reveal-wrap');
  const stickersWrap   = overlay.querySelector('.pack-stickers');
  const closeBtn       = overlay.querySelector('.pack-close');
  const prevBtn        = overlay.querySelector('.pack-arrow--prev');
  const nextBtn        = overlay.querySelector('.pack-arrow--next');
  const indicators     = overlay.querySelector('.pack-indicators');

  // Ocultar elementos hasta que los necesitemos
  gsap.set(revealWrap,   { display: 'none', opacity: 0 });
  gsap.set(overlay.querySelector('.pack-controls'), { opacity: 0 });
  gsap.set(closeBtn,     { opacity: 0, pointerEvents: 'none' });

  let activeIndex = Math.floor(stickers.length / 2);
  let entryAnimationDone = false;

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
    
    video.pause();
    
    gsap.to(videoContainer, {
      opacity: 0,
      scale: 0.8,
      duration: 0.35,
      ease: 'power2.in',
      onComplete: () => {
        videoContainer.style.display = 'none';
        gsap.set(revealWrap, { display: 'flex' });
        gsap.to(revealWrap, { opacity: 1, duration: 0.35 });
        revealCards();
      }
    });
  }

  video.addEventListener('ended', skipVideo);
  videoContainer.addEventListener('click', skipVideo);

  function updateCarousel(immediate = false) {
    const cards = stickersWrap.querySelectorAll('.pack-sticker-card');
    cards.forEach((card, i) => {
      const offset = i - activeIndex;
      const absOffset = Math.abs(offset);
      
      let xPercent = -50;
      let z = 0;
      let ry = 0;
      let sc = 1;
      let op = 1;
      let zi = 10 - absOffset;

      if (offset !== 0) {
        xPercent = -50 + (offset * 38); // fanned out spacing
        z = absOffset * -80; // depth offset
        ry = (45 - (absOffset - 1) * 10) * (offset < 0 ? 1 : -1); // rotation Y (more parallel)
        sc = 1 - absOffset * 0.12; // scale (larger)
        op = 1 - absOffset * 0.15; // opacity (more visible)
      }
      
      gsap.to(card, {
        xPercent: xPercent,
        yPercent: -50,
        x: 0,
        z: z,
        rotateY: ry,
        scale: Math.max(0.1, sc),
        opacity: Math.max(0, op),
        zIndex: zi,
        duration: immediate ? 0 : 0.6,
        ease: 'power2.out',
        overwrite: 'auto'
      });

      // Show/hide badges depending on focus and entry animation state
      const rarity = card.querySelector('.pack-rarity-badge');
      const badge = card.querySelector('.pack-badge');
      const pasteBtn = card.querySelector('.pack-paste-btn');

      if (offset === 0 && entryAnimationDone) {
        if (rarity) gsap.to(rarity, { opacity: 1, pointerEvents: 'auto', duration: 0.3 });
        if (badge) gsap.to(badge, { opacity: 1, pointerEvents: 'auto', duration: 0.3 });
        if (pasteBtn) gsap.to(pasteBtn, { opacity: 1, pointerEvents: 'auto', duration: 0.3 });
      } else {
        if (rarity) gsap.to(rarity, { opacity: 0, pointerEvents: 'none', duration: 0.3 });
        if (badge) gsap.to(badge, { opacity: 0, pointerEvents: 'none', duration: 0.3 });
        if (pasteBtn) gsap.to(pasteBtn, { opacity: 0, pointerEvents: 'none', duration: 0.3 });
      }
    });

    // Indicadores
    const inds = indicators.querySelectorAll('.pack-indicator');
    inds.forEach((ind, i) => {
      ind.classList.toggle('active', i === activeIndex);
    });

    if (prevBtn) prevBtn.disabled = activeIndex === 0;
    if (nextBtn) nextBtn.disabled = activeIndex === cards.length - 1;
  }

  function revealCards() {
    // Generar indicadores
    indicators.innerHTML = '';
    stickers.forEach((_, i) => {
      const ind = document.createElement('div');
      ind.className = 'pack-indicator';
      if (i === activeIndex) ind.classList.add('active');
      ind.addEventListener('click', (e) => {
        e.stopPropagation();
        activeIndex = i;
        updateCarousel();
      });
      indicators.appendChild(ind);
    });

    stickers.forEach((sticker, index) => {
      const emp = {
        ...sticker,
        id:        sticker.id || sticker.employee_id,
        name:      sticker.name || sticker.employee_name || '?',
        role:      sticker.role || sticker.employee_role || '',
        photo_url: sticker.photo_url || null,
      };

      const card = document.createElement('div');
      card.className = 'pack-sticker-card';

      // Rarity
      const rarityBadge = document.createElement('span');
      rarityBadge.className = `pack-rarity-badge pack-rarity-badge--${emp.rarity || 'common'}`;
      rarityBadge.textContent =
        emp.rarity === 'legendary' ? 'Legendaria' :
        emp.rarity === 'rare'      ? 'Mítica'     : 'Común';

      const cardWrapper = document.createElement('div');
      cardWrapper.className = 'pack-card-wrapper';

      const cardGlow = document.createElement('div');
      cardGlow.className = 'pack-card-glow';

      const cardInner = document.createElement('div');
      cardInner.className = 'pack-card-inner';

      const cardBack = document.createElement('div');
      cardBack.className = 'pack-card-face pack-card-back';

      const cardFront = document.createElement('div');
      cardFront.className = 'pack-card-face pack-card-front';
      cardFront.innerHTML = renderSticker(emp, true);

      cardInner.appendChild(cardBack);
      cardInner.appendChild(cardFront);
      cardWrapper.appendChild(cardGlow);
      cardWrapper.appendChild(cardInner);

      const statusBadge = document.createElement('span');
      statusBadge.className = `pack-badge ${sticker.is_new ? 'pack-badge--new' : 'pack-badge--repeat'}`;
      statusBadge.textContent = sticker.is_new ? '¡Nueva!' : 'Repetida';

      card.appendChild(rarityBadge);
      card.appendChild(cardWrapper);
      card.appendChild(statusBadge);

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
            onStickerPasted?.(emp);
          } else {
            console.error('Error al pegar laminita desde el reveal:', error);
            pasteBtn.disabled = false;
            pasteBtn.textContent = '📌 Pegar en álbum';
          }
        };
        card.appendChild(pasteBtn);
      }

      // Hacer que al hacer clic en una carta de los lados se vuelva activa
      card.addEventListener('click', () => {
        if (activeIndex !== index) {
          activeIndex = index;
          updateCarousel();
        }
      });

      stickersWrap.appendChild(card);
    });

    // Inicializar posiciones
    updateCarousel(true);

    // Animación de entrada + flip secuencial con GSAP
    const cards = stickersWrap.querySelectorAll('.pack-sticker-card');
    cards.forEach((card, index) => {
      const cardInner = card.querySelector('.pack-card-inner');
      const cardGlow = card.querySelector('.pack-card-glow');
      const emp = stickers[index];

      const offset = index - activeIndex;
      const absOffset = Math.abs(offset);
      const targetScale = offset === 0 ? 1 : Math.max(0.1, 1 - absOffset * 0.12);
      const targetOpacity = offset === 0 ? 1 : Math.max(0, 1 - absOffset * 0.15);

      gsap.fromTo(card,
        { opacity: 0, y: 80, scale: 0.5 },
        {
          opacity: targetOpacity,
          y: 0,
          scale: targetScale,
          duration: 0.5,
          delay: index * 0.15,
          ease: 'back.out(1.2)',
          onComplete: () => {
            gsap.to(cardInner, {
              rotateY: 180,
              duration: 0.6,
              delay: 0.1,
              ease: 'power2.inOut',
              onComplete: () => {
                if (index === activeIndex) {
                  const rarity = card.querySelector('.pack-rarity-badge');
                  const badge = card.querySelector('.pack-badge');
                  const pasteBtn = card.querySelector('.pack-paste-btn');
                  if (rarity) gsap.to(rarity, { opacity: 1, pointerEvents: 'auto', duration: 0.3 });
                  if (badge) gsap.to(badge, { opacity: 1, pointerEvents: 'auto', duration: 0.3 });
                  if (pasteBtn) gsap.to(pasteBtn, { opacity: 1, pointerEvents: 'auto', duration: 0.3 });
                }

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

                if (index === stickers.length - 1) {
                  entryAnimationDone = true;
                  // Mostrar controles de carrusel
                  gsap.to(overlay.querySelector('.pack-controls'), {
                    opacity: 1,
                    duration: 0.35
                  });
                  // Mostrar botón cerrar
                  gsap.to(closeBtn, {
                    opacity: 1,
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

  // Navegación con flechas
  prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeIndex > 0) {
      activeIndex--;
      updateCarousel();
    }
  });

  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeIndex < stickers.length - 1) {
      activeIndex++;
      updateCarousel();
    }
  });

  // Teclado
  const handleKeydown = (e) => {
    if (e.key === 'ArrowLeft') {
      if (activeIndex > 0) {
        activeIndex--;
        updateCarousel();
      }
    } else if (e.key === 'ArrowRight') {
      if (activeIndex < stickers.length - 1) {
        activeIndex++;
        updateCarousel();
      }
    }
  };
  window.addEventListener('keydown', handleKeydown);

  // Cerrar
  closeBtn.addEventListener('click', () => {
    window.removeEventListener('keydown', handleKeydown);
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
