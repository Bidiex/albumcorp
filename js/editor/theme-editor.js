import { supabase } from '../core/supabase.js';
import { PALETTES, applyTheme } from '../core/theme.js';

const PALETTE_DESCRIPTIONS = {
  obsidiana: 'Negro profundo con acentos esmeralda. Máximo contraste.',
  pergamino: 'Cálido y clásico. El álbum Panini de papel de toda la vida.',
  indigo:    'Azul medianoche con acentos violeta. Tecnológico y premium.',
  mercurio:  'Carbón y plateado. Minimalismo absoluto.',
  ambar:     'Oscuro cálido con dorados intensos. Lujo y coleccionismo.',
};

let _companyId = null;
let _selectedPalette = 'obsidiana';
let _sections = [];

export function initThemeEditor(companyId, currentTheme, sections = []) {
  _companyId = companyId;
  _selectedPalette = currentTheme?.palette_name || 'obsidiana';
  _sections = sections;
  renderPaletteCards();
  loadCurrentImages(currentTheme);
  loadCustomPages(currentTheme);
  bindSaveButton();

  // Aplicar paleta visualmente en el editor al iniciar
  applyTheme({ palette_name: _selectedPalette });
}

function renderPaletteCards() {
  const container = document.getElementById('palette-selector');
  if (!container) return;

  container.innerHTML = '';

  Object.entries(PALETTES).forEach(([key, palette]) => {
    const isSelected = key === _selectedPalette;
    const card = document.createElement('div');
    card.className = `palette-card ${isSelected ? 'palette-card--selected' : ''}`;
    card.dataset.palette = key;

    // Preview de colores — 5 swatches
    const swatchKeys = [
      '--color-album-bg',
      '--color-accent',
      '--color-nav-btn',
      '--color-action-primary',
      '--color-action-secondary',
    ];

    const swatchesHtml = swatchKeys
      .map(k => `<span class="palette-swatch" style="background:${palette[k]}"></span>`)
      .join('');

    card.innerHTML = `
      <div class="palette-preview" style="background:${palette['--color-album-bg']}">
        <div class="palette-swatches">${swatchesHtml}</div>
        <span class="palette-name-preview" 
          style="color:${palette['--color-text-primary']}">
          ${palette.name || key}
        </span>
      </div>
      <div class="palette-info">
        <span class="palette-name">${palette.name || key}</span>
        <span class="palette-desc">${PALETTE_DESCRIPTIONS[key] || ''}</span>
      </div>
      ${isSelected ? '<span class="palette-check">✓</span>' : ''}
    `;

    card.addEventListener('click', () => selectPalette(key));
    container.appendChild(card);
  });
}

function selectPalette(key) {
  _selectedPalette = key;
  renderPaletteCards();
}

function loadCurrentImages(theme) {
  if (!theme) return;
  const fields = [
    ['cover_image_url',       'preview-cover-link'],
    ['inner_cover_image_url', 'preview-innercover-link'],
    ['back_cover_image_url',  'preview-backcover-link'],
    ['back_inner_image_url',  'preview-backinner-link'],
  ];
  fields.forEach(([field, previewId]) => {
    if (theme[field]) {
      const el = document.getElementById(previewId);
      if (el) {
        el.style.display = 'block';
        el.querySelector('a').href = theme[field];
      }
    }
  });
}

// ══════════════════════════════════════════════
//   PÁGINAS PERSONALIZADAS
// ══════════════════════════════════════════════

function loadCustomPages(theme) {
  const existing = (theme?.custom_pages || []);
  existing.forEach(cp => {
    addCustomPageRow(cp.section_id, cp.position, cp.image_url, cp.id);
  });

  const addBtn = document.getElementById('btn-add-custom-page');
  if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', () => addCustomPageRow());
  }
}

/**
 * Adds a custom page row to the custom-pages-container.
 * @param {string} [sectionId] - Pre-selected section id
 * @param {string} [position]  - 'before' | 'after'
 * @param {string} [imageUrl]  - Existing image URL
 * @param {string} [id]        - Stable row ID (from DB); new rows get a fresh UUID
 */
function addCustomPageRow(sectionId = '', position = 'before', imageUrl = '', id = '') {
  const container = document.getElementById('custom-pages-container');
  if (!container) return;

  const rowId = id || crypto.randomUUID();

  const row = document.createElement('div');
  row.className = 'custom-page-row';
  row.dataset.id = rowId;
  row.style.cssText = [
    'display: flex',
    'gap: var(--space-sm)',
    'align-items: center',
    'border: 1px solid var(--border-light)',
    'padding: 8px',
    'border-radius: var(--radius-sm)',
    'flex-wrap: wrap',
  ].join('; ');

  // Build section options
  const sectionOptions = _sections.map(s =>
    `<option value="${s.id}" ${s.id === sectionId ? 'selected' : ''}>${s.name}</option>`
  ).join('');

  const linkHtml = imageUrl
    ? `<a href="${imageUrl}" target="_blank" class="custom-page-link"
         style="font-size:0.8rem; color:var(--primary); white-space:nowrap;">🔗 Ver</a>`
    : '';

  row.innerHTML = `
    <select class="form-select custom-page-section" style="flex:2; min-width:130px;">
      <option value="">— Sección —</option>
      ${sectionOptions}
    </select>
    <select class="form-select custom-page-position" style="width:100px;">
      <option value="before" ${position === 'before' ? 'selected' : ''}>Antes</option>
      <option value="after"  ${position === 'after'  ? 'selected' : ''}>Después</option>
    </select>
    <input type="file" class="form-input custom-page-file" accept="image/*" style="flex:3; min-width:140px;">
    ${linkHtml}
    <button class="btn btn-danger btn-sm btn-remove-custom-page">❌</button>
    <input type="hidden" class="custom-page-url"  value="${imageUrl}">
    <input type="hidden" class="custom-page-id"   value="${rowId}">
  `;

  row.querySelector('.btn-remove-custom-page').addEventListener('click', () => {
    // Use confirmAction from employees.js if available, otherwise just remove
    if (window.__confirmAction) {
      window.__confirmAction('¿Eliminar esta página personalizada?', () => row.remove());
    } else {
      row.remove();
    }
  });

  container.appendChild(row);
}

/**
 * Collects all custom page rows and uploads new images if needed.
 * Returns the custom_pages JSONB array ready to persist.
 */
async function buildCustomPagesPayload() {
  const container = document.getElementById('custom-pages-container');
  if (!container) return [];

  const rows = container.querySelectorAll('.custom-page-row');
  const result = [];

  for (const row of rows) {
    const sectionId = row.querySelector('.custom-page-section')?.value;
    const position  = row.querySelector('.custom-page-position')?.value;
    const fileInput = row.querySelector('.custom-page-file');
    let   imageUrl  = row.querySelector('.custom-page-url')?.value || '';
    const rowId     = row.querySelector('.custom-page-id')?.value  || crypto.randomUUID();

    if (!sectionId) continue; // Skip rows without a section selected

    // Upload new image if provided
    if (fileInput?.files?.length) {
      const file = fileInput.files[0];
      const ext  = file.name.split('.').pop();
      const path = `${_companyId}/custom_${rowId}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('album-assets')
        .upload(path, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('album-assets')
        .getPublicUrl(path);

      imageUrl = urlData.publicUrl;

      // Update the hidden url field and show link
      const urlInput = row.querySelector('.custom-page-url');
      if (urlInput) urlInput.value = imageUrl;

      let link = row.querySelector('.custom-page-link');
      if (!link) {
        link = document.createElement('a');
        link.className = 'custom-page-link';
        link.target = '_blank';
        link.style.cssText = 'font-size:0.8rem; color:var(--primary); white-space:nowrap;';
        link.textContent = '🔗 Ver';
        row.querySelector('.btn-remove-custom-page').before(link);
      }
      link.href = imageUrl;
    }

    if (!imageUrl) continue; // Skip rows without an image

    result.push({
      id:         rowId,
      section_id: sectionId,
      position,
      image_url:  imageUrl,
      // page_number is null here; fn_compute_album_layout fills it on publish
    });
  }

  return result;
}

/**
 * Collects all page background rows and uploads new images if needed.
 * Returns the page_backgrounds JSONB object ready to persist.
 */
async function buildPageBackgroundsPayload() {
  const container = document.getElementById('page-bgs-container');
  if (!container) return {};

  const rows = container.querySelectorAll('.page-bg-row');
  const result = {};

  for (const row of rows) {
    const pageNumInput = row.querySelector('.page-bg-num');
    const pageNum = pageNumInput?.value?.trim();
    if (!pageNum) continue; // Skip rows without page number

    const fileInput = row.querySelector('.page-bg-file');
    let imageUrl = '';

    // Check if there is an existing link and extract data-current
    const existingLink = row.querySelector('a[data-current]');
    if (existingLink) {
      imageUrl = existingLink.getAttribute('data-current') || '';
    }

    // Upload new image if provided
    if (fileInput?.files?.length) {
      const file = fileInput.files[0];
      const ext  = file.name.split('.').pop();
      const path = `${_companyId}/${pageNum}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('album-backgrounds')
        .upload(path, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('album-backgrounds')
        .getPublicUrl(path);

      imageUrl = urlData.publicUrl;

      // Update the DOM to show the new link and set data-current
      let link = row.querySelector('a');
      if (!link) {
        link = document.createElement('a');
        link.target = '_blank';
        link.style.cssText = 'font-size:0.8rem; color:var(--primary); margin-left:8px;';
        link.textContent = '🔗 Ver actual';
        const removeBtn = row.querySelector('.btn-remove-bg');
        if (removeBtn) {
          removeBtn.before(link);
        } else {
          row.appendChild(link);
        }
      }
      link.href = imageUrl;
      link.setAttribute('data-current', imageUrl);
    }

    if (imageUrl) {
      result[pageNum] = imageUrl;
    }
  }

  return result;
}

function bindSaveButton() {
  const btn = document.getElementById('btn-save-theme');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    const feedback = document.getElementById('theme-feedback');

    try {
      // 1. Guardar paleta seleccionada
      const { error: paletteErr } = await supabase
        .from('album_theme')
        .update({ palette_name: _selectedPalette })
        .eq('company_id', _companyId);

      if (paletteErr) throw paletteErr;

      // 2. Subir imágenes de portadas si hay archivos seleccionados
      const imageFields = [
        { inputId: 'input-cover-file',      dbField: 'cover_image_url',       path: 'cover' },
        { inputId: 'input-innercover-file', dbField: 'inner_cover_image_url', path: 'inner_cover' },
        { inputId: 'input-backcover-file',  dbField: 'back_cover_image_url',  path: 'back_cover' },
        { inputId: 'input-backinner-file',  dbField: 'back_inner_image_url',  path: 'back_inner' },
      ];

      const updates = {};

      for (const field of imageFields) {
        const input = document.getElementById(field.inputId);
        if (!input?.files?.length) continue;
        const file = input.files[0];
        const ext = file.name.split('.').pop();
        const filePath = `${_companyId}/${field.path}_${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('album-assets')
          .upload(filePath, file, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage
          .from('album-assets')
          .getPublicUrl(filePath);
        updates[field.dbField] = urlData.publicUrl;
      }

      if (Object.keys(updates).length > 0) {
        const { error: imgErr } = await supabase
          .from('album_theme')
          .update(updates)
          .eq('company_id', _companyId);
        if (imgErr) throw imgErr;
      }

      // 3. Guardar páginas personalizadas
      const customPages = await buildCustomPagesPayload();
      const { error: cpErr } = await supabase
        .from('album_theme')
        .update({ custom_pages: customPages })
        .eq('company_id', _companyId);
      if (cpErr) throw cpErr;

      // 4. Guardar fondos de páginas interiores
      const pageBackgrounds = await buildPageBackgroundsPayload();
      const { error: bgErr } = await supabase
        .from('album_theme')
        .update({ page_backgrounds: pageBackgrounds })
        .eq('company_id', _companyId);
      if (bgErr) throw bgErr;

      // 5. Aplicar paleta visualmente en el editor
      applyTheme({ palette_name: _selectedPalette });

      if (feedback) {
        feedback.textContent = '✓ Tema guardado correctamente';
        feedback.style.color = '#22C55E';
      }
    } catch (err) {
      console.error('Error guardando tema:', err);
      if (feedback) {
        feedback.textContent = `Error: ${err.message}`;
        feedback.style.color = '#EF4444';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Guardar tema';
    }
  });
}

export { PALETTES };
