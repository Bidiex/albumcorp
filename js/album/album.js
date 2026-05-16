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
    <div class="page page--inner-cover">
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
    <div class="page page--back-inner">
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
    autoSize: false,
    maxShadowOpacity: 0.5,
    showCover: true,
    mobileScrollSupport: false,
    clickEventForward: true,
    useMouseEvents: true,
    swipeDistance: 30,
    showPageCorners: false,
    disableFlipByClick: false
  });

  pageFlip.loadFromHTML(pageElements);

  document.getElementById('btn-prev').addEventListener('click', () => pageFlip.flipPrev());
  document.getElementById('btn-next').addEventListener('click', () => pageFlip.flipNext());
}

function renderProgressBar(collected, total) {
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');

  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = `${collected} / ${total} stickers (${percent}%)`;
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
      stickers.forEach(sticker => {
        if (sticker.is_new) {
          collectedIds.add(sticker.employee_id);
          const empData = employees.find(e => e.id === sticker.employee_id);
          if (empData) {
            const stickerEl = document.querySelector(
              `.sticker[data-employee-id="${sticker.employee_id}"]`
            );
            if (stickerEl) {
              const temp = document.createElement('div');
              temp.innerHTML = renderSticker(empData, true);
              stickerEl.replaceWith(temp.firstElementChild);
            }
          }
        }
      });
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

    const { data: newCount, error } = await supabase.rpc('fn_dev_add_packs', { p_n: n });

    if (error) {
      status.textContent = `Error: ${error.message}`;
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

  // Botón flotante
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'btn-duplicates';
  toggleBtn.className = 'duplicates-btn';
  toggleBtn.textContent = '🔄 Repetidos';
  
  let floatingActions = document.getElementById('floating-actions');
  if (!floatingActions) {
    floatingActions = document.createElement('div');
    floatingActions.id = 'floating-actions';
    floatingActions.className = 'floating-actions';
    document.body.appendChild(floatingActions);
  }
  floatingActions.appendChild(toggleBtn);

  // Overlay de cierre
  const backdrop = document.createElement('div');
  backdrop.className = 'duplicates-backdrop';
  document.body.appendChild(backdrop);

  // Panel lateral
  const panel = document.createElement('div');
  panel.className = 'duplicates-panel';
  panel.innerHTML = `
    <div class="duplicates-panel__header">
      <h3 class="duplicates-panel__title">🔄 Stickers Repetidos</h3>
      <button class="duplicates-panel__close" id="btn-close-duplicates">✕</button>
    </div>
    <div class="duplicates-panel__body" id="duplicates-body"></div>
  `;
  document.body.appendChild(panel);

  async function loadDuplicates() {
    const body = document.getElementById('duplicates-body');
    body.innerHTML = '<p class="duplicates-empty">Cargando...</p>';

    const { data, error } = await supabase
      .from('user_duplicates')
      .select('quantity, employees(id, name, role, photo_url, rarity)')
      .eq('user_id', userId)
      .gt('quantity', 0)
      .order('quantity', { ascending: false });

    if (error || !data || data.length === 0) {
      body.innerHTML = '<p class="duplicates-empty">No tienes stickers repetidos aún.</p>';
      toggleBtn.textContent = '🔄 Repetidos';
      return;
    }

    body.innerHTML = '';
    data.forEach(({ quantity, employees: emp }) => {
      if (!emp) return;
      const card = document.createElement('div');
      card.className = 'duplicate-card';
      card.innerHTML = renderSticker(emp, true);
      const badge = document.createElement('span');
      badge.className = 'duplicate-qty';
      badge.textContent = `×${quantity}`;
      card.appendChild(badge);
      // Botón Pegar
      const alreadyInAlbum = collectedIds.has(emp.id);
      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'duplicate-paste-btn';
      if (alreadyInAlbum) {
        pasteBtn.textContent = '✓ En álbum';
        pasteBtn.disabled = true;
        pasteBtn.classList.add('duplicate-paste-btn--collected');
      } else {
        pasteBtn.textContent = '📌 Pegar';
        pasteBtn.onclick = async () => {
          pasteBtn.disabled = true;
          pasteBtn.textContent = 'Pegando...';
          const { error } = await supabase.rpc('fn_paste_sticker', { p_employee_id: emp.id });
          if (!error) {
            collectedIds.add(emp.id);
            const stickerEl = document.querySelector(`.sticker[data-employee-id="${emp.id}"]`);
            if (stickerEl) {
              const temp = document.createElement('div');
              temp.innerHTML = renderSticker(emp, true);
              stickerEl.replaceWith(temp.firstElementChild);
            }
            renderProgressBar(collectedIds.size, (await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', profile.company_id).eq('is_active', true)).count || collectedIds.size);
            loadDuplicates();
          } else {
            pasteBtn.disabled = false;
            pasteBtn.textContent = '📌 Pegar';
          }
        };
      }
      card.appendChild(pasteBtn);
      body.appendChild(card);
    });

    toggleBtn.textContent = `🔄 Repetidos (${data.length})`;
  }

  function openPanel() {
    panel.classList.add('open');
    backdrop.classList.add('visible');
    loadDuplicates();
  }

  function closePanel() {
    panel.classList.remove('open');
    backdrop.classList.remove('visible');
  }

  toggleBtn.addEventListener('click', openPanel);
  document.getElementById('btn-close-duplicates').addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);

  // Exponer refresh global para llamar tras abrir sobre
  window.__refreshDuplicates = loadDuplicates;

  // Carga inicial del count en el botón
  const { data: initial } = await supabase
    .from('user_duplicates')
    .select('quantity')
    .eq('user_id', userId)
    .gt('quantity', 0);

  if (initial && initial.length > 0) {
    toggleBtn.textContent = `🔄 Repetidos (${initial.length})`;
  }
}

// Iniciar
initAlbum();
