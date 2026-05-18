import { PageFlip } from 'page-flip';
import { supabase } from '../core/supabase.js';
import { guardRoute } from '../core/auth.js';
import { loadTheme } from '../core/theme.js';
import { renderSticker } from './stickers.js';
import { openPack } from './pack.js';
import { renderExchangeModal } from './exchange.js';

let pageFlip = null;
let currentTheme = null;

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

  // 3. UI adicional
  renderProgressBar(collectedIds.size, employees.length);
  renderPackButton(packsAvailable, profile, employees, collectedIds);
  renderDuplicatesTray(profile, collectedIds);
  renderExchangeModal(profile, employees, collectedIds);

  // DEV ONLY — remover antes de producción
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    renderDevTools(profile);
  }
}

async function fetchAlbumData(profile) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  const [empRes, collRes, packRes, secRes] = await Promise.all([
    supabase.from('employees')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
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
        ${logoHtml}
        <h1 class="album-title">${companyName}</h1>
        <p class="album-subtitle">Álbum Corporativo</p>
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
    const stickerHtml = page.slots.map(slot => {
      if (!slot) return '<div class="sticker-placeholder"></div>';
      return renderSticker(slot.data, slot.isCollected);
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

  const availableWidth = container.clientWidth - 32;

  const progressEl = document.getElementById('progress-container');
  const navEl = document.querySelector('.album-nav');
  
  const progressHeight = progressEl ? progressEl.offsetHeight + 16 : 0;
  const navHeight = navEl ? navEl.offsetHeight + 16 : 0;
  const paddingHeight = 64; 
  
  const availableHeight = window.innerHeight - progressHeight - navHeight - paddingHeight;

  const bookWidth = 900;
  const bookHeight = 600;

  const scaleX = availableWidth / bookWidth;
  const scaleY = availableHeight / bookHeight;
  const scale = Math.min(scaleX, scaleY, 1);

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
  if (!btn) return;

  let packs = packsAvailable;

  function updateButton() {
    if (packs > 0) {
      btn.disabled = false;
      btn.textContent = `🎁 Abrir sobre (${packs})`;
    } else {
      btn.disabled = true;
      btn.textContent = 'Sin sobres disponibles';
    }
  }

  updateButton();

  btn.onclick = async () => {
    await openPack(profile, (stickers) => {
      renderProgressBar(collectedIds.size, employees.length);
      packs = Math.max(0, packs - 1);
      updateButton();
      window.__refreshDuplicates?.();
    });
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
    <div class="baul-modal__body" id="baul-body"></div>
  `;
  document.body.appendChild(modal);

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
      toggleBtn.textContent = '🧳 Mi Baúl';
      return;
    }

    body.innerHTML = '';
    data.forEach(({ quantity, employees: emp }) => {
      if (!emp) return;
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
            pasteBtn.disabled = false;
            pasteBtn.textContent = '📌 Pegar';
          }
        };
      }
      card.appendChild(pasteBtn);
      body.appendChild(card);
    });

    toggleBtn.textContent = `🧳 Mi Baúl (${data.length})`;
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
    toggleBtn.textContent = `🧳 Mi Baúl (${initial.length})`;
  }
}

// Iniciar
initAlbum();
