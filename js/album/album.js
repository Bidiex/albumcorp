import { PageFlip } from 'page-flip';
import { supabase } from '../core/supabase.js';
import { guardRoute, logoutUser } from '../core/auth.js';
import { loadTheme } from '../core/theme.js';
import { renderSticker } from './stickers.js';
import { openPack } from './pack.js';
import { renderExchangeModal } from './exchange.js';
import {
  initMilestones,
  isMilestonesEnabled,
  checkMilestones,
  renderBattlePass,
  refreshUserMilestones
} from './milestones.js';

let pageFlip = null;
let currentTheme = null;
let flipSound = null;

async function initAlbum() {
  const profile = await guardRoute(['employee', 'editor']);
  if (!profile) return;

  currentTheme = await loadTheme(profile.company_id);

  const { employees, collectedIds, packsAvailable, sections } = await fetchAlbumData(profile);

  const pages = buildPages(employees, collectedIds, sections);

  // 1. Montar DOM primero
  renderAlbumHTML(pages);

  // 2. Inicializar PageFlip DESPUÉS del mount
  initPageFlip();
  requestAnimationFrame(adjustBookScale);
  window.addEventListener('resize', () => requestAnimationFrame(adjustBookScale));

  // 3. Inicializar hitos (en paralelo, no bloquea el álbum)
  initMilestones(profile, employees.length, collectedIds).catch(err =>
    console.warn('No se pudieron cargar los hitos:', err)
  );

  // 4. UI adicional
  renderProgressBar(collectedIds.size, employees.length);
  renderPackButton(packsAvailable, profile, employees, collectedIds);
  renderLegendaryCollection(profile);
  renderDuplicatesTray(profile, collectedIds);
  renderExchangeModal(profile, employees, collectedIds);

  // DEV ONLY — remover antes de producción
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    renderDevTools(profile);
  }

  renderUserMenu(profile, collectedIds, employees);
  await renderRanking(profile, collectedIds);

  // ── Pre-carga de Recursos (Preloader) ──
  const preloader = document.getElementById('album-preloader');
  const progressBar = document.getElementById('preloader-bar');
  const progressStatus = document.getElementById('preloader-status');
  const openBtn = document.getElementById('btn-preloader-open');

  // Recopilar URLs de imágenes a precargar de forma única
  const imageUrls = new Set();
  if (currentTheme?.cover_image_url) imageUrls.add(currentTheme.cover_image_url);
  if (currentTheme?.inner_cover_image_url) imageUrls.add(currentTheme.inner_cover_image_url);
  if (currentTheme?.logo_url) imageUrls.add(currentTheme.logo_url);
  if (currentTheme?.back_inner_image_url) imageUrls.add(currentTheme.back_inner_image_url);
  if (currentTheme?.back_cover_image_url) imageUrls.add(currentTheme.back_cover_image_url);
  
  if (currentTheme?.page_backgrounds) {
    Object.values(currentTheme.page_backgrounds).forEach(url => {
      if (url) imageUrls.add(url);
    });
  }
  
  employees.forEach(emp => {
    if (emp.photo_url) imageUrls.add(emp.photo_url);
    if (emp.placeholder_url) imageUrls.add(emp.placeholder_url);
  });

  const assetsToLoad = [...imageUrls];
  const audioUrl = '/the_mountain-football-485564.mp3';
  const flipSoundUrl = '/freesound_community-small-page-103398.mp3';
  
  let loadedCount = 0;
  const totalAssets = assetsToLoad.length + 2; // +2 para música e himno de página

  function updateProgress() {
    loadedCount++;
    const pct = Math.min(100, Math.floor((loadedCount / totalAssets) * 100));
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressStatus) {
      if (pct < 85) {
        progressStatus.textContent = `Cargando recursos del álbum... ${pct}%`;
      } else if (pct < 100) {
        progressStatus.textContent = `Preparando efectos interactivos... ${pct}%`;
      } else {
        progressStatus.textContent = '¡Todo listo para comenzar!';
      }
    }
  }

  // Cargar e intentar decodificar imágenes en paralelo para evitar renderizado parcial en pantalla
  const imagePromises = assetsToLoad.map(url => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        if (typeof img.decode === 'function') {
          img.decode()
            .then(() => {
              updateProgress();
              resolve();
            })
            .catch(err => {
              console.warn(`Error al decodificar la imagen: ${url}`, err);
              updateProgress();
              resolve();
            });
        } else {
          updateProgress();
          resolve();
        }
      };
      img.onerror = () => {
        updateProgress();
        resolve();
      };
      img.src = url;
    });
  });

  // Cargar audio en paralelo
  let loadedAudio = null;
  const audioPromise = new Promise(resolve => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0.4;
    
    audio.addEventListener('canplaythrough', () => {
      loadedAudio = audio;
      updateProgress();
      resolve();
    }, { once: true });
    
    audio.addEventListener('error', (e) => {
      console.warn("No se pudo pre-cargar el audio de fondo:", e);
      updateProgress();
      resolve();
    }, { once: true });
    
    audio.src = audioUrl;
    audio.load();
  });

  // Cargar sonido de pase de página en paralelo
  const flipPromise = new Promise(resolve => {
    const audio = new Audio();
    audio.volume = 0.55;
    
    audio.addEventListener('canplaythrough', () => {
      flipSound = audio;
      updateProgress();
      resolve();
    }, { once: true });
    
    audio.addEventListener('error', (e) => {
      console.warn("No se pudo pre-cargar el efecto de pase de página:", e);
      updateProgress();
      resolve();
    }, { once: true });
    
    audio.src = flipSoundUrl;
    audio.load();
  });

  // Ejecutar pre-carga completa
  await Promise.all([...imagePromises, audioPromise, flipPromise]);

  // Completar carga
  if (progressBar) progressBar.style.width = '100%';
  if (progressStatus) progressStatus.textContent = '¡Álbum cargado con éxito!';
  const preloaderTitle = document.getElementById('preloader-title');
  if (preloaderTitle) preloaderTitle.textContent = 'Álbum cargado';

  if (openBtn && preloader) {
    if (progressBar) progressBar.parentElement.style.display = 'none';
    if (progressStatus) progressStatus.style.display = 'none';
    openBtn.style.display = 'flex';
    
    openBtn.onclick = () => {
      // Intentar reproducir música gracias a la interacción explícita del click
      if (loadedAudio) {
        loadedAudio.play().catch(err => console.log("Audio play bloqueado:", err));
        window.__bgMusic = loadedAudio;
        initMusicController();
      }
      
      // Animación de salida y remoción
      preloader.classList.add('preloader--hidden');
      setTimeout(() => preloader.remove(), 700);
    };
  }
}

function initMusicController() {
  if (document.getElementById('btn-music-toggle')) return;
  
  const btn = document.createElement('button');
  btn.id = 'btn-music-toggle';
  btn.className = 'music-toggle-btn';
  btn.innerHTML = '🎵';
  btn.setAttribute('aria-label', 'Silenciar música');
  
  btn.onclick = () => {
    if (window.__bgMusic) {
      if (window.__bgMusic.paused) {
        window.__bgMusic.play().catch(err => console.log(err));
        btn.innerHTML = '🎵';
        btn.classList.remove('music-toggle-btn--muted');
      } else {
        window.__bgMusic.pause();
        btn.innerHTML = '🔇';
        btn.classList.add('music-toggle-btn--muted');
      }
    }
  };
  
  document.body.appendChild(btn);
}

async function fetchAlbumData(profile) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  const [empRes, collRes, packRes, secRes] = await Promise.all([
    supabase.from('employees')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .neq('rarity', 'legendary')
      .order('page_number', { ascending: true })
      .order('position', { ascending: true }),
    supabase.from('user_collection')
      .select('employee_id')
      .eq('user_id', userId),
    supabase.from('user_pack_status')
      .select('packs_available')
      .eq('user_id', userId)
      .single(),
    supabase.from('album_sections')
      .select('id, name')
      .eq('company_id', profile.company_id)
  ]);

  const employees = empRes.data || [];
  const collectedIds = new Set((collRes.data || []).map(c => c.employee_id));
  const packsAvailable = packRes.data?.packs_available || 0;
  const sections = secRes.data || [];

  return { employees, collectedIds, packsAvailable, sections };
}

function buildPages(employees, collectedIds, sections) {
  const pagesMap = {};

  employees.forEach(emp => {
    if (!emp.page_number) return;
    if (!pagesMap[emp.page_number]) {
      pagesMap[emp.page_number] = { slots: [], sectionId: null };
    }
    const pg = pagesMap[emp.page_number];
    if (!pg.sectionId) pg.sectionId = emp.section_id;
    pg.slots.push({ pos: emp.position, data: emp, isCollected: collectedIds.has(emp.id) });
  });

  // Determine which pages are section covers
  // A section cover is the first page where a given section_id appears
  const seenSections = new Set();

  return Object.keys(pagesMap)
    .sort((a, b) => Number(a) - Number(b))
    .map(pageNum => {
      const pg = pagesMap[pageNum];
      const sectionId = pg.sectionId;
      const section = sections.find(s => s.id === sectionId);
      const isSectionCover = sectionId && !seenSections.has(sectionId);
      if (sectionId) seenSections.add(sectionId);

      const maxSlots = isSectionCover ? 6 : 9;
      const slotsArray = Array(maxSlots).fill(null);
      pg.slots.forEach(s => {
        if (s.pos >= 1 && s.pos <= maxSlots) {
          slotsArray[s.pos - 1] = { data: s.data, isCollected: s.isCollected };
        }
      });

      return {
        number: pageNum,
        slots: slotsArray,
        sectionName: section ? section.name : `Sección ${pageNum}`,
        isSectionCover
      };
    });
}

function renderAlbumHTML(pages) {
  const book = document.getElementById('book');

  // Limpiar antes de montar
  book.innerHTML = '';

  const companyName = currentTheme?.company_name || 'PaniniCorp';
  const logoUrl = currentTheme?.logo_url || null;
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${companyName}" class="album-cover-logo">`
    : '';

  const coverStyle = currentTheme?.cover_image_url 
    ? `background-image: url('${currentTheme.cover_image_url}');` 
    : '';

  // Portada — data-density="hard" para StPageFlip
  book.insertAdjacentHTML('beforeend', `
    <div class="page page--cover" data-density="hard">
      <div class="page-content page-content--cover" style="${coverStyle}">
      </div>
    </div>
  `);

  // Página interior de portada — decorativa
  const innerCoverStyle = currentTheme?.inner_cover_image_url
    ? `background-image: url('${currentTheme.inner_cover_image_url}');`
    : '';
  book.insertAdjacentHTML('beforeend', `
    <div class="page page--inner-cover" data-density="hard">
      <div class="page-content" style="${innerCoverStyle}"></div>
    </div>
  `);

  // Páginas de contenido
  pages.forEach(page => {
    // Las primeras 8 páginas tendrán carga 'eager' para evitar que se vean incompletas al abrir el álbum
    const isEager = Number(page.number) <= 8;
    const stickerHtml = page.slots.map(slot => {
      if (!slot) return '<div class="sticker-placeholder"></div>';
      return renderSticker(slot.data, slot.isCollected, isEager);
    }).join('');

    const pageBgUrl = (currentTheme?.page_backgrounds || {})[page.number];
    const pageStyle = pageBgUrl ? `background-image: url('${pageBgUrl}');` : '';

    const gridClass = page.isSectionCover ? 'sticker-grid sticker-grid--cover' : 'sticker-grid';

    book.insertAdjacentHTML('beforeend', `
      <div class="page">
        <div class="page-content" style="${pageStyle}">
          <div class="${gridClass}">
            ${stickerHtml}
          </div>
        </div>
      </div>
    `);
  });

  // Paridad: páginas internas = inner-cover + contenido + back-inner
  // Para StPageFlip con showCover:true las dos tapas hard no cuentan
  // Las internas (entre las tapas) deben ser par
  const innerPages = 1 + pages.length + 1; // inner-cover + content + back-inner
  if (innerPages % 2 !== 0) {
    book.insertAdjacentHTML('beforeend', `<div class="page page--blank"></div>`);
  }

  // Back inner cover — cara interna de la contraportada (decorativa)
  const backInnerStyle = currentTheme?.back_inner_image_url
    ? `background-image: url('${currentTheme.back_inner_image_url}');`
    : '';
  book.insertAdjacentHTML('beforeend', `
    <div class="page page--back-inner" data-density="hard">
      <div class="page-content" style="${backInnerStyle}"></div>
    </div>
  `);

  // Contraportada
  const backCoverStyle = currentTheme?.back_cover_image_url 
    ? `background-image: url('${currentTheme.back_cover_image_url}');` 
    : '';
  book.insertAdjacentHTML('beforeend', `
    <div class="page page--back-cover" data-density="hard">
      <div class="page-content" style="${backCoverStyle}"></div>
    </div>
  `);
}

function initPageFlip() {
  const pageElements = document.querySelectorAll('#book .page');
  console.log('Páginas encontradas:', pageElements.length);

  if (pageElements.length === 0) {
    console.error('initPageFlip: no se encontraron elementos .page en #book');
    return;
  }

  const bookEl = document.getElementById('book');

  pageFlip = new PageFlip(bookEl, {
    width: 450,
    height: 600,
    size: 'fixed',
    drawShadow: true,
    flippingTime: 700,
    usePortrait: false,
    startZIndex: 0,
    autoSize: true,
    maxShadowOpacity: 0.5,
    showCover: true,
    mobileScrollSupport: false,
    clickEventForward: true,
    useMouseEvents: true,
    swipeDistance: 30,
    showPageCorners: false,
    disableFlipByClick: true
  });

  // Reproducir el sonido físico de papel únicamente para páginas interiores (no tapas)
  pageFlip.on('flip', (e) => {
    const total = pageFlip.getPageCount();
    const currentPage = pageFlip.getCurrentPageIndex();
    const targetPage = e.data;
    
    if (currentPage > 0 && currentPage < total - 1 && targetPage > 0 && targetPage < total - 1) {
      if (flipSound) {
        flipSound.currentTime = 0;
        flipSound.play().catch(err => console.log("Error playing flip sound:", err));
      }
    }
  });

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => pageFlip?.flipPrev());
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => pageFlip?.flipNext());
  }

  requestAnimationFrame(() => {
    pageFlip.loadFromHTML(pageElements);
  });
}

function adjustBookScale() {
  const viewport = document.querySelector('.album-viewport');
  const book = document.getElementById('book');
  if (!viewport || !book) return;

  const container = document.getElementById('album-container');
  if (!container) return;

  // Detectar si estamos en modo landscape forzado (dispositivos móviles en portrait)
  const isForcedLandscape = window.innerWidth < 768 && window.innerHeight > window.innerWidth;

  const screenW = isForcedLandscape ? window.innerHeight : container.clientWidth;
  const screenH = isForcedLandscape ? window.innerWidth : window.innerHeight;

  // En móviles las flechas se colocan debajo del álbum, por lo que no requieren espacio lateral.
  // Usamos 32px de margen lateral seguro. En escritorio/wide usamos 240px.
  const marginWidth = window.innerWidth < 768 ? 32 : 240;
  const availableWidth = screenW - marginWidth;

  const progressEl = document.getElementById('progress-container');
  
  // Altura del progreso bar con colchón de aire (Red Band is in corners on mobile, only needs 32px spacing)
  const progressHeight = window.innerWidth < 768 ? 32 : (progressEl ? progressEl.offsetHeight + 32 : 60);
  
  // En móviles las flechas van debajo del álbum y requieren espacio (68px para dar aire abajo).
  // En escritorio las flechas están a los lados y los botones en las esquinas inferiores (32px).
  const bottomSpacing = window.innerWidth < 768 ? 68 : 32;
  
  // Margen de seguridad vertical adicional
  const paddingHeight = window.innerWidth < 768 ? 24 : 40; 
  
  const availableHeight = screenH - progressHeight - bottomSpacing - paddingHeight;

  const bookWidth = 900;
  const bookHeight = 600;

  const scaleX = availableWidth / bookWidth;
  const scaleY = availableHeight / bookHeight;
  const scale = Math.min(scaleX, scaleY, 1); // Capped at 1 for laptops/desktops

  book.style.transform = `scale(${scale})`;
  book.style.transformOrigin = 'center center';

  viewport.style.width = `${bookWidth * scale}px`;
  viewport.style.height = `${bookHeight * scale}px`;
}

function renderProgressBar(collected, total) {
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
  const text = document.getElementById('progress-text');

  if (text) text.textContent = `${collected} / ${total} - ${percent}%`;
}

function renderPackButton(packsAvailable, profile, employees, collectedIds) {
  const btn = document.getElementById('btn-open-pack');
  const badge = document.getElementById('pack-count-badge');
  if (!btn) return;

  let packs = packsAvailable;

  function updateButton() {
    btn.innerHTML = '🎁';
    if (badge) {
      badge.textContent = packs;
    }

    if (packs > 0) {
      btn.disabled = false;
    } else {
      btn.disabled = true;
    }
  }

  updateButton();

  // Define sticker pasted callback globally so exchange.js can reuse it
  window.__onStickerPasted = (emp) => {
    collectedIds.add(emp.id);
    const stickerEl = document.querySelector(`.sticker[data-employee-id="${emp.id}"]`);
    if (stickerEl) {
      const temp = document.createElement('div');
      temp.innerHTML = renderSticker(emp, true);
      const newEl = temp.firstElementChild;
      newEl.classList.add('sticker--just-pasted');
      newEl.addEventListener('animationend', () => newEl.classList.remove('sticker--just-pasted'), { once: true });
      stickerEl.replaceWith(newEl);
    }
    renderProgressBar(collectedIds.size, employees.length);
    window.__refreshDuplicates?.();
    // Verificar hitos tras pegar laminita
    checkMilestones(collectedIds).catch(err => console.warn('checkMilestones error:', err));
  };

  btn.onclick = async () => {
    await openPack(profile, (stickers) => {
      // onComplete: se dispara al cerrar el overlay
      renderProgressBar(collectedIds.size, employees.length);
      packs = Math.max(0, packs - 1);
      updateButton();
      window.__refreshDuplicates?.();
      // Verificar hitos tras abrir sobre
      checkMilestones(collectedIds).catch(err => console.warn('checkMilestones error:', err));
    }, window.__onStickerPasted);
  };

  window.__refreshPackCount = (n) => { packs = n; updateButton(); };
}

function renderDevTools(profile) {
  const bar = document.createElement('div');
  bar.className = 'dev-toolbar';
  bar.innerHTML = `
    <span class="dev-toolbar__label">🛠 DEV</span>
    <button id="dev-add-pack" class="dev-toolbar__btn dev-toolbar__btn--green">+1 Sobre</button>
    <button id="dev-add-5packs" class="dev-toolbar__btn dev-toolbar__btn--blue">+5 Sobres</button>
    <span id="dev-status" class="dev-toolbar__status"></span>
  `;
  document.body.appendChild(bar);

  async function addPacks(n) {
    const status = document.getElementById('dev-status');
    status.textContent = 'Agregando...';

    const userId = (await supabase.auth.getUser()).data.user.id;

    // Leer el valor actual
    const { data: current, error: readErr } = await supabase
      .from('user_pack_status')
      .select('packs_available')
      .eq('user_id', userId)
      .single();

    if (readErr && readErr.code !== 'PGRST116') { // PGRST116 es not found (no hay fila aún)
      status.textContent = `Error: ${readErr.message}`;
      return;
    }

    const currentCount = current ? current.packs_available : 0;
    const newCount = currentCount + n;

    // Update directo — la fila siempre existe tras el insert manual
    const { error: updateErr } = await supabase
      .from('user_pack_status')
      .update({ packs_available: newCount })
      .eq('user_id', userId);

    if (updateErr) {
      status.textContent = `Error: ${updateErr.message}`;
      return;
    }

    status.textContent = `packs_available: ${newCount} ✓`;
    if (window.__refreshPackCount) window.__refreshPackCount(newCount);
  }

  document.getElementById('dev-add-pack').onclick = () => addPacks(1);
  document.getElementById('dev-add-5packs').onclick = () => addPacks(5);
}

async function renderDuplicatesTray(profile, collectedIds) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  // ── Botón flotante ──
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'btn-duplicates';
  toggleBtn.className = 'duplicates-btn';
  toggleBtn.textContent = '🧳 Mi Baúl';

  function updateBaulBadge(count) {
    let badge = toggleBtn.querySelector('.baul-badge-counter');
    if (badge) badge.remove();
    if (count > 0) {
      badge = document.createElement('span');
      badge.className = 'baul-badge-counter';
      badge.textContent = count;
      toggleBtn.appendChild(badge);
    }
  }

  let bottomActions = document.getElementById('bottom-actions');
  if (bottomActions) {
    bottomActions.insertBefore(toggleBtn, bottomActions.firstChild);
  } else {
    document.body.appendChild(toggleBtn);
  }

  // ── Modal centrado ──
  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'baul-backdrop';
  document.body.appendChild(modalBackdrop);

  const modal = document.createElement('div');
  modal.className = 'baul-modal';
  modal.innerHTML = `
    <div class="baul-modal__header">
      <h3 class="baul-modal__title">🧳 Mi Baúl</h3>
      <button class="baul-modal__close" id="btn-close-baul">✕</button>
    </div>
    <div class="baul-filters">
      <div class="baul-search-wrapper">
        <span class="baul-search-icon">🔍</span>
        <input type="text" id="baul-search-input" placeholder="Buscar por nombre..." class="baul-search-input" autocomplete="off" />
      </div>
      <div class="baul-rarity-filters">
        <button class="baul-filter-btn active" data-rarity="all">Todos</button>
        <button class="baul-filter-btn" data-rarity="common">Comunes</button>
        <button class="baul-filter-btn" data-rarity="rare">Míticas</button>
        <button class="baul-filter-btn" data-rarity="legendary">Legendarios</button>
      </div>
    </div>
    <div class="baul-modal__body" id="baul-body"></div>
  `;
  document.body.appendChild(modal);

  // Variables de estado del buscador y filtros
  let rawDuplicates = [];
  let currentRarityFilter = 'all';
  let currentSearchQuery = '';

  // Escuchadores de eventos para filtros
  const searchInput = modal.querySelector('#baul-search-input');
  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    filterAndRender();
  });

  const filterBtns = modal.querySelectorAll('.baul-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRarityFilter = btn.getAttribute('data-rarity');
      filterAndRender();
    });
  });

  async function loadBaul() {
    const body = document.getElementById('baul-body');
    body.innerHTML = '<p class="baul-empty">Cargando...</p>';

    const { data, error } = await supabase
      .from('user_duplicates')
      .select('quantity, employees(id, name, role, photo_url, rarity)')
      .eq('user_id', userId)
      .gt('quantity', 0)
      .order('quantity', { ascending: false });

    if (error || !data || data.length === 0) {
      body.innerHTML = '<p class="baul-empty">Tu baúl está vacío por ahora.</p>';
      updateBaulBadge(0);
      rawDuplicates = [];
      return;
    }

    rawDuplicates = data.filter(d => d.employees !== null);
    updateBaulBadge(rawDuplicates.length);
    filterAndRender();
  }

  function filterAndRender() {
    const body = document.getElementById('baul-body');
    if (!body) return;

    // Filtrar en memoria para una respuesta instantánea
    const filtered = rawDuplicates.filter(({ employees: emp }) => {
      // 1. Filtro por categoría de rareza
      if (currentRarityFilter !== 'all' && (emp.rarity || 'common') !== currentRarityFilter) {
        return false;
      }
      // 2. Filtro por búsqueda por nombre
      if (currentSearchQuery.trim() !== '') {
        const name = (emp.name || '').toLowerCase();
        const query = currentSearchQuery.toLowerCase().trim();
        if (!name.includes(query)) {
          return false;
        }
      }
      return true;
    });

    if (filtered.length === 0) {
      body.innerHTML = '<p class="baul-empty">No se encontraron láminas duplicadas con estos filtros.</p>';
      return;
    }

    body.innerHTML = '';
    filtered.forEach(({ quantity, employees: emp }) => {
      const card = document.createElement('div');
      card.className = 'baul-card';
      card.innerHTML = renderSticker(emp, true);

      const badge = document.createElement('span');
      badge.className = 'baul-qty';
      badge.textContent = `×${quantity}`;
      card.appendChild(badge);

      const alreadyInAlbum = collectedIds.has(emp.id);
      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'baul-paste-btn';

      if (alreadyInAlbum) {
        pasteBtn.textContent = '✓ En álbum';
        pasteBtn.disabled = true;
      } else {
        pasteBtn.textContent = '📌 Pegar';
        pasteBtn.onclick = async () => {
          pasteBtn.disabled = true;
          pasteBtn.textContent = 'Pegando...';
          const { error } = await supabase.rpc('fn_paste_sticker', {
            p_employee_id: emp.id
          });
          if (!error) {
            collectedIds.add(emp.id);
            const stickerEl = document.querySelector(
              `.sticker[data-employee-id="${emp.id}"]`
            );
            if (stickerEl) {
              const temp = document.createElement('div');
              temp.innerHTML = renderSticker(emp, true);
              stickerEl.replaceWith(temp.firstElementChild);
            }
            const { count } = await supabase
              .from('employees')
              .select('id', { count: 'exact', head: true })
              .eq('company_id', profile.company_id)
              .eq('is_active', true);
            renderProgressBar(collectedIds.size, count || collectedIds.size);
            loadBaul();
          } else {
            console.error('Error al pegar laminita desde el baúl:', error);
            pasteBtn.disabled = false;
            pasteBtn.textContent = '📌 Pegar';
          }
        };
      }
      card.appendChild(pasteBtn);
      body.appendChild(card);
    });
  }

  function openModal() {
    modal.classList.add('open');
    modalBackdrop.classList.add('visible');
    loadBaul();
  }

  function closeModal() {
    modal.classList.remove('open');
    modalBackdrop.classList.remove('visible');
  }

  toggleBtn.addEventListener('click', openModal);
  document.getElementById('btn-close-baul').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  window.__refreshDuplicates = loadBaul;

  const { data: initial } = await supabase
    .from('user_duplicates')
    .select('quantity')
    .eq('user_id', userId)
    .gt('quantity', 0);

  if (initial && initial.length > 0) {
    updateBaulBadge(initial.length);
  }
}

function renderUserMenu(profile, collectedIds, employees) {
  const menu = document.getElementById('user-menu');
  const backdrop = document.getElementById('user-menu-backdrop');
  if (!menu || !backdrop) return;

  // 1. Crear el botón hamburger con el avatar del usuario
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'btn-user-menu-toggle';
  toggleBtn.className = 'user-avatar-btn';
  const initialLetter = (profile.display_name || 'U').charAt(0).toUpperCase();
  const shortName = (profile.display_name || 'Usuario').split(' ')[0];
  toggleBtn.innerHTML = `
    <span class="user-avatar-btn__letter">${initialLetter}</span>
    <span class="user-avatar-btn__name">${shortName}</span>
    <span class="user-avatar-btn__icon">☰</span>
  `;

  const container = document.getElementById('album-container') || document.body;

  // Wrapper para agrupar botón usuario + botón ranking
  const topBar = document.createElement('div');
  topBar.id = 'album-top-bar';
  topBar.style.cssText = `
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  topBar.appendChild(toggleBtn);
  container.appendChild(topBar);

  // Carga inicial de datos del menú
  const avatar = document.getElementById('menu-avatar');
  const name = document.getElementById('menu-name');
  const stickerCount = document.getElementById('menu-sticker-count');
  const completion = document.getElementById('menu-completion');

  if (avatar) avatar.textContent = initialLetter;
  if (name) name.textContent = profile.display_name || 'Usuario';

  function updateMenuStats() {
    const collected = collectedIds.size;
    const total = employees.length;
    const pct = total > 0 ? Math.round((collected / total) * 100) : 0;

    if (stickerCount) stickerCount.textContent = collected;
    if (completion) completion.textContent = `${pct}%`;
  }

  updateMenuStats();

  // 2. Controlar la apertura y cierre
  const openMenu = () => {
    updateMenuStats();
    menu.classList.add('open');
    backdrop.classList.add('visible');
  };

  const closeMenu = () => {
    menu.classList.remove('open');
    backdrop.classList.remove('visible');
  };

  toggleBtn.addEventListener('click', openMenu);
  document.getElementById('btn-close-user-menu')?.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);

  // 6. btn-logout-menu → llama logoutUser()
  document.getElementById('btn-logout-menu')?.addEventListener('click', async () => {
    await logoutUser();
  });

  // 7. btn-delete-account → RPC fn_delete_employee_account → logoutUser()
  document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
    const confirmed = confirm('¿Estás absolutamente seguro de que deseas eliminar tu cuenta permanentemente? Esta acción es irreversible y perderás todo tu progreso en el álbum.');
    if (!confirmed) return;

    const { error } = await supabase.rpc('fn_delete_employee_account');
    if (error) {
      alert(`Error al eliminar la cuenta: ${error.message}`);
    } else {
      alert('Tu cuenta ha sido eliminada correctamente.');
      await logoutUser();
    }
  });
}

async function renderLegendaryCollection(profile) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  // Obtener todas las legendarias de la empresa
  const { data: allLegendary } = await supabase
    .from('employees')
    .select('id, name, photo_url, rarity')
    .eq('company_id', profile.company_id)
    .eq('is_active', true)
    .eq('rarity', 'legendary');

  if (!allLegendary || allLegendary.length === 0) return;

  // Obtener las que tiene el usuario
  const { data: grants } = await supabase
    .from('legendary_grants')
    .select('employee_id')
    .eq('user_id', userId)
    .eq('company_id', profile.company_id);

  const grantedIds = new Set((grants || []).map(g => g.employee_id));
  const collectedCount = grantedIds.size;
  const totalCount = allLegendary.length;

  const container = document.getElementById('album-container') || document.body;

  // Botón flotante
  const btn = document.createElement('button');
  btn.id = 'btn-legendary';
  btn.className = 'legendary-btn';
  btn.innerHTML = `⭐ <span id="legendary-count">${collectedCount}/${totalCount}</span>`;
  container.appendChild(btn);

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'legendary-overlay';
  overlay.innerHTML = `
    <div class="legendary-modal">
      <div class="legendary-modal__header">
        <h2 class="legendary-modal__title">⭐ Laminitas Legendarias</h2>
        <button class="legendary-modal__close" id="btn-close-legendary">✕</button>
      </div>
      <p class="legendary-modal__subtitle">
        ${collectedCount} de ${totalCount} conseguidas
      </p>
      <div class="legendary-grid" id="legendary-grid"></div>
    </div>
  `;
  container.appendChild(overlay);

  function renderGrid() {
    const grid = document.getElementById('legendary-grid');
    if (!grid) return;
    grid.innerHTML = '';
    allLegendary.forEach(emp => {
      const hasIt = grantedIds.has(emp.id);
      const card = document.createElement('div');
      card.className = `legendary-card ${hasIt ? 'legendary-card--collected' : 'legendary-card--locked'}`;
      card.innerHTML = hasIt
        ? renderSticker(emp, true)
        : `<div class="legendary-card__locked">
             <span class="legendary-card__lock">🔒</span>
             <span class="legendary-card__lock-name">???</span>
           </div>`;
      grid.appendChild(card);
    });
  }

  renderGrid();

  function openOverlay() {
    overlay.classList.add('visible');
  }
  function closeOverlay() {
    overlay.classList.remove('visible');
  }

  btn.addEventListener('click', openOverlay);
  document.getElementById('btn-close-legendary')
    ?.addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  window.__refreshLegendary = async () => {
    const { data: freshGrants } = await supabase
      .from('legendary_grants')
      .select('employee_id')
      .eq('user_id', userId)
      .eq('company_id', profile.company_id);

    grantedIds.clear();
    (freshGrants || []).forEach(g => grantedIds.add(g.employee_id));

    const newCount = grantedIds.size;
    const countEl = document.getElementById('legendary-count');
    if (countEl) countEl.textContent = `${newCount}/${totalCount}`;

    const subtitle = overlay.querySelector('.legendary-modal__subtitle');
    if (subtitle) {
      subtitle.textContent = `${newCount} de ${totalCount} conseguidas`;
    }
    renderGrid();
  };
}

async function renderRanking(profile, collectedIds) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  // Botón de posición
  const rankBtn = document.createElement('button');
  rankBtn.id = 'btn-ranking';
  rankBtn.className = 'ranking-btn';
  rankBtn.textContent = '…';

  const topBar = document.getElementById('album-top-bar');
  if (topBar) topBar.appendChild(rankBtn);

  // Modal con 2 tabs: Ranking + Pase de Batalla
  const modal = document.createElement('div');
  modal.className = 'ranking-modal-overlay';
  modal.innerHTML = `
    <div class="ranking-modal">
      <div class="ranking-modal__header">
        <h2 class="ranking-modal__title">🏆 Ranking</h2>
        <button class="ranking-modal__close" id="btn-close-ranking">✕</button>
      </div>

      <div class="ranking-modal-tabs">
        <button class="ranking-modal-tab ranking-modal-tab--active" data-rtab="ranking">
          🏆 Ranking
        </button>
        <button class="ranking-modal-tab" data-rtab="battlepass">
          🏅 Mis Medallas
        </button>
      </div>

      <!-- Panel: Ranking -->
      <div class="ranking-tab-panel ranking-tab-panel--active" id="rtab-panel-ranking">
        <div class="ranking-search-wrap">
          <input type="text" id="ranking-search"
            class="ranking-search"
            placeholder="Buscar colaborador...">
        </div>
        <div class="ranking-list" id="ranking-list">
          <p class="ranking-empty">Cargando...</p>
        </div>
      </div>

      <!-- Panel: Pase de Batalla -->
      <div class="ranking-tab-panel" id="rtab-panel-battlepass">
        <div class="battlepass-container" id="battlepass-container">
          <p class="ranking-empty">Cargando...</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Lógica de tabs del ranking modal
  modal.querySelectorAll('.ranking-modal-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      modal.querySelectorAll('.ranking-modal-tab')
        .forEach(t => t.classList.remove('ranking-modal-tab--active'));
      modal.querySelectorAll('.ranking-tab-panel')
        .forEach(p => p.classList.remove('ranking-tab-panel--active'));

      tab.classList.add('ranking-modal-tab--active');
      const panelId = 'rtab-panel-' + tab.dataset.rtab;
      document.getElementById(panelId)?.classList.add('ranking-tab-panel--active');

      if (tab.dataset.rtab === 'battlepass') {
        await refreshUserMilestones(profile.company_id);
        renderBattlePass(
          document.getElementById('battlepass-container'),
          collectedIds
        );
      }
    });
  });

  let rankingData = [];

  async function loadRanking() {
    const { data, error } = await supabase
      .rpc('fn_get_ranking', { p_company_id: profile.company_id });

    if (error || !data) return;
    rankingData = data;

    // Actualizar botón con posición del usuario actual
    const myEntry = data.find(r => r.user_id === userId);
    if (myEntry) {
      rankBtn.textContent = `#${myEntry.position}`;
    }

    renderList(data);
  }

  function renderList(data) {
    const list = document.getElementById('ranking-list');
    if (!list) return;

    if (!data || data.length === 0) {
      list.innerHTML = '<p class="ranking-empty">Sin datos aún.</p>';
      return;
    }

    list.innerHTML = '';
    data.forEach(entry => {
      const isMe = entry.user_id === userId;
      const row = document.createElement('div');
      row.className = `ranking-row ${isMe ? 'ranking-row--me' : ''}`;
      row.dataset.name = entry.display_name.toLowerCase();

      const medal =
        entry.position === 1n ? '🥇' :
        entry.position === 2n ? '🥈' :
        entry.position === 3n ? '🥉' : '';

      row.innerHTML = `
        <span class="ranking-row__pos">${medal || '#' + entry.position}</span>
        <span class="ranking-row__name">
          ${entry.display_name}
          ${isMe ? '<span class="ranking-row__you">(tú)</span>' : ''}
        </span>
        <span class="ranking-row__count">${entry.stickers_count} 🏷️</span>
      `;
      list.appendChild(row);
    });

    // Scroll al usuario actual
    const myRow = list.querySelector('.ranking-row--me');
    if (myRow) {
      setTimeout(() => myRow.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
    }
  }

  // Buscador
  document.getElementById('ranking-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = q
      ? rankingData.filter(r => r.display_name.toLowerCase().includes(q))
      : rankingData;
    renderList(filtered);
  });

  // Abrir / cerrar
  rankBtn.addEventListener('click', () => {
    modal.classList.add('visible');
    loadRanking();
  });

  document.getElementById('btn-close-ranking')
    ?.addEventListener('click', () => modal.classList.remove('visible'));

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('visible');
  });

  // Carga inicial del botón
  loadRanking();

  // Exponer refresh
  window.__refreshRanking = loadRanking;
}

// Iniciar
initAlbum();
