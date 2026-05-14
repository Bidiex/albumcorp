import { PageFlip } from 'page-flip';
import { supabase } from '../core/supabase.js';
import { guardRoute } from '../core/auth.js';
import { loadTheme } from '../core/theme.js';
import { renderSticker } from './stickers.js';
import { openPack } from './pack.js';

let pageFlip = null;

async function initAlbum() {
  const profile = await guardRoute(['employee', 'editor']);
  if (!profile) return;

  await loadTheme(profile.company_id);

  const { employees, collectedIds, packsAvailable, companyName, sections } = await fetchAlbumData(profile);
  
  const pages = buildPages(employees, collectedIds, sections);
  renderAlbumHTML(pages, companyName);
  initPageFlip();
  
  renderProgressBar(collectedIds.size, employees.length);
  renderPackButton(packsAvailable);
}

async function fetchAlbumData(profile) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  const [empRes, collRes, packRes, compRes, secRes] = await Promise.all([
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
    supabase.from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .single(),
    supabase.from('album_sections')
      .select('id, name')
      .eq('company_id', profile.company_id)
  ]);

  const employees = empRes.data || [];
  const collectedIds = new Set((collRes.data || []).map(c => c.employee_id));
  const packsAvailable = packRes.data?.packs_available || 0;
  const companyName = compRes.data?.name || 'Mi Empresa';
  const sections = secRes.data || [];

  return { employees, collectedIds, packsAvailable, companyName, sections };
}

function buildPages(employees, collectedIds, sections) {
  const pagesMap = {};
  
  // Agrupar por página
  employees.forEach(emp => {
    if (!emp.page_number) return;
    if (!pagesMap[emp.page_number]) {
      pagesMap[emp.page_number] = Array(9).fill(null);
    }
    // Posiciones son 1-9, array es 0-8
    pagesMap[emp.page_number][emp.position - 1] = {
      data: emp,
      isCollected: collectedIds.has(emp.id)
    };
  });

  // Convertir a array ordenado
  return Object.keys(pagesMap)
    .sort((a, b) => Number(a) - Number(b))
    .map(pageNum => {
      // Intentar encontrar el nombre de la sección desde el primer empleado de la página
      const firstEmp = pagesMap[pageNum].find(slot => slot !== null)?.data;
      const section = sections.find(s => s.id === firstEmp?.section_id);
      
      return {
        number: pageNum,
        slots: pagesMap[pageNum],
        sectionName: section ? section.name : `Sección ${pageNum}`
      };
    });
}

function renderAlbumHTML(pages, companyName) {
  const book = document.getElementById('book');
  
  let html = `
    <!-- Página 0: portada -->
    <div class="page page--cover" data-density="hard">
      <div class="page-content">
        <h1 class="album-title">${companyName}</h1>
        <p class="album-subtitle">Álbum Corporativo</p>
      </div>
    </div>
  `;

  pages.forEach(page => {
    const stickerHtml = page.slots.map(slot => {
      if (!slot) return '<div class="sticker-placeholder"></div>';
      return renderSticker(slot.data, slot.isCollected);
    }).join('');

    html += `
      <div class="page">
        <div class="page-content">
          <h2 class="section-title">${page.sectionName}</h2>
          <div class="sticker-grid">
            ${stickerHtml}
          </div>
        </div>
      </div>
    `;
  });

  html += `
    <!-- Contraportada -->
    <div class="page page--cover page--back" data-density="hard">
      <div class="page-content">
        <p class="album-subtitle">PaniniCorp © 2024</p>
      </div>
    </div>
  `;

  book.innerHTML = html;
}

function initPageFlip() {
  const bookElement = document.getElementById('book');
  pageFlip = new PageFlip(bookElement, {
    width: 550,
    height: 733,
    size: 'stretch',
    minWidth: 315,
    maxWidth: 1000,
    minHeight: 420,
    maxHeight: 1350,
    showCover: true,
    mobileScrollSupport: false,
    usePortrait: false,
    flippingTime: 800
  });

  pageFlip.loadFromHTML(document.querySelectorAll('.page'));

  document.getElementById('btn-prev').onclick = () => pageFlip.flipPrev();
  document.getElementById('btn-next').onclick = () => pageFlip.flipNext();
}

function renderProgressBar(collected, total) {
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = `${collected} / ${total} stickers (${percent}%)`;
}

function renderPackButton(packsAvailable) {
  const btn = document.getElementById('btn-open-pack');
  if (!btn) return;

  if (packsAvailable > 0) {
    btn.disabled = false;
    btn.textContent = `🎁 Abrir sobre (${packsAvailable})`;
    btn.onclick = async () => {
      await openPack();
      // Recargar datos después de abrir (opcional, dependiendo de cómo manejes el estado)
      initAlbum();
    };
  } else {
    btn.disabled = true;
    btn.textContent = 'Sin sobres disponibles';
  }
}

// Iniciar
initAlbum();
