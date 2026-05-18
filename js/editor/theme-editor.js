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

export function initThemeEditor(companyId, currentTheme) {
  _companyId = companyId;
  _selectedPalette = currentTheme?.palette_name || 'obsidiana';
  renderPaletteCards();
  loadCurrentImages(currentTheme);
  bindSaveButton();
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

      // 2. Subir imágenes si hay archivos seleccionados
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

      // 3. Aplicar paleta visualmente en el editor
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
