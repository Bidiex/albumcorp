/**
 * employees.js — Orquestador del Panel del Editor
 * Gestiona: navegación, carga inicial, empleados, secciones, layout, packs, tema
 */
import { supabase } from '../core/supabase.js';
import { guardRoute, logoutUser } from '../core/auth.js';

// ── Estado global de la sesión ──
let profile = null;
let companyId = null;
let employees = [];
let sections = [];

// ── Elementos DOM reutilizables ──
const $ = (id) => document.getElementById(id);

// ══════════════════════════════════════════════
//   INIT
// ══════════════════════════════════════════════
async function init() {
  profile = await guardRoute(['editor']);
  if (!profile) return;

  companyId = profile.company_id;

  // Ocultar loading, mostrar app
  $('loading-overlay').style.display = 'none';
  $('app').style.display = 'flex';

  // Poblar UI de sesión
  const name = profile.display_name || 'Editor';
  $('sidebar-user-name').textContent = name;
  $('sidebar-avatar').textContent = name.charAt(0).toUpperCase();

  // Cargar nombre empresa
  const { data: company } = await supabase
    .from('companies')
    .select('name, slug')
    .eq('id', companyId)
    .single();

  if (company) {
    $('sidebar-company-name').textContent = company.name;
    $('join-link').textContent = `${location.origin}/join.html?slug=${company.slug}`;
  }

  // Configurar navegación
  setupNav();

  // Configurar logout
  $('btn-logout').addEventListener('click', logoutUser);

  // Configurar atajos de sección empresa
  $('btn-go-employees').addEventListener('click', () => activateSection('empleados'));
  $('btn-go-layout').addEventListener('click', () => activateSection('layout'));
  $('btn-copy-link').addEventListener('click', () => {
    navigator.clipboard.writeText($('join-link').textContent);
    $('btn-copy-link').textContent = '✅ Copiado';
    setTimeout(() => ($('btn-copy-link').textContent = '📋 Copiar'), 2000);
  });

  // Cargar datos iniciales
  await Promise.all([loadSections(), loadEmployees()]);
  loadStats();
  loadLayoutPreview();
  loadPackConfig();
  loadTheme();

  // Configurar formularios
  setupEmployeeForm();
  setupSectionForm();
  setupPackConfig();
  setupTheme();
  setupLayoutPublish();
}

// ══════════════════════════════════════════════
//   NAVEGACIÓN
// ══════════════════════════════════════════════
function setupNav() {
  document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      activateSection(btn.dataset.section);
    });
  });
}

function activateSection(name) {
  // Ocultar todas
  document.querySelectorAll('.editor-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));

  // Activar la correcta
  $(`section-${name}`)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');
}

// ══════════════════════════════════════════════
//   STATS
// ══════════════════════════════════════════════
function loadStats() {
  $('stat-employees').textContent = employees.length;
  $('stat-sections').textContent = sections.length;
  const active = employees.filter(e => e.is_active).length;
  $('stat-active').textContent = active;

  // Calcular páginas con layout Panini (6 first + 9 rest por sección)
  let totalPages = 0;
  sections.forEach(sec => {
    const count = employees.filter(e => e.section_id === sec.id).length;
    if (count === 0) return;
    if (count <= 6) {
      totalPages += 1;
    } else {
      totalPages += 1 + Math.ceil((count - 6) / 9);
    }
  });
  $('stat-pages').textContent = totalPages || '—';
}

// ══════════════════════════════════════════════
//   SECCIONES
// ══════════════════════════════════════════════
async function loadSections() {
  const { data, error } = await supabase
    .from('album_sections')
    .select('*')
    .eq('company_id', companyId)
    .order('order_index');

  if (error) { console.error(error); return; }
  sections = data || [];
  renderSections();
  populateSectionSelects();
}

function renderSections() {
  const list = $('sections-list');
  if (!sections.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📘</div>
        <div class="empty-state-title">Sin secciones todavía</div>
        <div class="empty-state-text">Crea tu primera sección para organizar a los empleados en el álbum.</div>
      </div>`;
    return;
  }

  list.innerHTML = sections.map(sec => {
    const count = employees.filter(e => e.section_id === sec.id).length;
    return `
      <div class="section-row" data-id="${sec.id}">
        <span class="section-row-drag">⠿</span>
        <span class="section-row-name">${sec.name}</span>
        <span class="section-row-count">${count} empleado${count !== 1 ? 's' : ''}</span>
        <div class="section-row-actions">
          <button class="btn btn-ghost btn-sm btn-rename-section" data-id="${sec.id}" data-name="${sec.name}">✏️</button>
          <button class="btn btn-danger btn-sm btn-delete-section" data-id="${sec.id}">🗑️</button>
        </div>
      </div>`;
  }).join('');

  // Rename
  list.querySelectorAll('.btn-rename-section').forEach(btn => {
    btn.addEventListener('click', () => {
      const newName = prompt('Nuevo nombre:', btn.dataset.name);
      if (newName && newName.trim()) renameSection(btn.dataset.id, newName.trim());
    });
  });

  // Delete
  list.querySelectorAll('.btn-delete-section').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar esta sección? Los empleados quedarán sin sección asignada.')) {
        deleteSection(btn.dataset.id);
      }
    });
  });
}

function populateSectionSelects() {
  const options = sections.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  const emptyOption = '<option value="">— Sin sección —</option>';

  $('input-emp-section').innerHTML = emptyOption + options;

  const filterSec = $('emp-filter-section');
  filterSec.innerHTML = '<option value="">Todas las secciones</option>' + options;

  const filterSec2 = $('emp-filter-section');
  filterSec2.innerHTML = '<option value="">Todas las secciones</option>' + options;
}

function setupSectionForm() {
  $('btn-add-section').addEventListener('click', async () => {
    const name = $('input-section-name').value.trim();
    if (!name) return showFeedback('section-feedback', 'Escribe un nombre para la sección.', 'error');

    const maxOrder = sections.reduce((m, s) => Math.max(m, s.order_index), 0);

    const { error } = await supabase.from('album_sections').insert({
      company_id: companyId,
      name,
      order_index: maxOrder + 1
    });

    if (error) return showFeedback('section-feedback', error.message, 'error');
    $('input-section-name').value = '';
    showFeedback('section-feedback', `Sección "${name}" creada. ✅`, 'success');
    await loadSections();
    loadStats();
  });
}

async function renameSection(id, name) {
  const { error } = await supabase.from('album_sections').update({ name }).eq('id', id);
  if (!error) await loadSections();
}

async function deleteSection(id) {
  const { error } = await supabase.from('album_sections').delete().eq('id', id);
  if (!error) { await loadSections(); await loadEmployees(); loadStats(); }
}

// ══════════════════════════════════════════════
//   EMPLEADOS
// ══════════════════════════════════════════════
async function loadEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  employees = data || [];
  renderEmployees(employees);
}

function renderEmployees(list) {
  const grid = $('employees-grid');
  $('emp-count').textContent = `${list.length} empleado${list.length !== 1 ? 's' : ''}`;

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-title">Sin empleados todavía</div>
        <div class="empty-state-text">Agrega el primer empleado usando el formulario de arriba.</div>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(emp => {
    const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const photo = emp.photo_url
      ? `<img src="${emp.photo_url}" alt="${emp.name}" loading="lazy">`
      : `<span>${initials}</span>`;
    const rarityBadge = `<span class="badge badge-${emp.rarity} rarity-indicator">${rarityLabel(emp.rarity)}</span>`;
    const sec = sections.find(s => s.id === emp.section_id);

    return `
      <div class="employee-card" data-id="${emp.id}">
        <div class="employee-card-photo">
          ${photo}
          ${rarityBadge}
        </div>
        <div class="employee-card-body">
          <div class="employee-card-name" title="${emp.name}">${emp.name}</div>
          <div class="employee-card-role" title="${emp.role || '—'}">${emp.role || '—'}</div>
          <div class="employee-card-code">${emp.code}</div>
          ${sec ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">📘 ${sec.name}</div>` : ''}
        </div>
        <div class="employee-card-actions">
          <button class="btn btn-ghost btn-sm btn-edit-emp" data-id="${emp.id}" style="flex:1;">✏️ Editar</button>
          <button class="btn btn-danger btn-sm btn-del-emp" data-id="${emp.id}">🗑️</button>
        </div>
      </div>`;
  }).join('');

  // Delete handlers
  grid.querySelectorAll('.btn-del-emp').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar este empleado del álbum?')) deleteEmployee(btn.dataset.id);
    });
  });

  // Edit handlers (simplified — re-populate form)
  grid.querySelectorAll('.btn-edit-emp').forEach(btn => {
    btn.addEventListener('click', () => editEmployee(btn.dataset.id));
  });
}

function rarityLabel(r) {
  return { common: '⬜ Común', rare: '💜 Raro', legendary: '⭐ Legendario' }[r] || r;
}

// ── Filtrado ──
function setupEmployeeFilters() {
  const search = $('emp-search');
  const secFilter = $('emp-filter-section');
  const rarityFilter = $('emp-filter-rarity');

  const doFilter = () => {
    const q = search.value.toLowerCase();
    const sec = secFilter.value;
    const rar = rarityFilter.value;

    const filtered = employees.filter(e => {
      const matchQ = !q || e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
      const matchSec = !sec || e.section_id === sec;
      const matchRar = !rar || e.rarity === rar;
      return matchQ && matchSec && matchRar;
    });

    renderEmployees(filtered);
  };

  search.addEventListener('input', doFilter);
  secFilter.addEventListener('change', doFilter);
  rarityFilter.addEventListener('change', doFilter);
}

// ── Formulario empleado ──
let editingEmployeeId = null;
let selectedPhotoFile = null;

function setupEmployeeForm() {
  setupPhotoUpload();
  setupEmployeeFilters();

  $('btn-save-employee').addEventListener('click', saveEmployee);
  $('btn-cancel-employee').addEventListener('click', cancelEmployeeEdit);
}

function setupPhotoUpload() {
  const input = $('input-photo');
  const area = $('photo-drop-area');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    selectedPhotoFile = file;
    showPhotoPreview(URL.createObjectURL(file));
  });

  area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = 'var(--primary)'; });
  area.addEventListener('dragleave', () => { area.style.borderColor = ''; });
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      selectedPhotoFile = file;
      showPhotoPreview(URL.createObjectURL(file));
    }
  });
}

function showPhotoPreview(url) {
  $('photo-preview-container').innerHTML = `<img src="${url}" class="photo-upload-preview" alt="Preview">`;
}

function resetPhotoPreview() {
  $('photo-preview-container').innerHTML = `
    <span style="font-size:2rem;">📷</span>
    <span class="photo-upload-hint">Haz clic o arrastra una foto</span>`;
  selectedPhotoFile = null;
  $('input-photo').value = '';
}

async function saveEmployee() {
  const name = $('input-emp-name').value.trim();
  const role = $('input-emp-role').value.trim();
  const sectionId = $('input-emp-section').value || null;
  const rarity = $('input-emp-rarity').value;

  if (!name) {
    return showFeedback('emp-feedback', 'El nombre es obligatorio.', 'error');
  }

  const btn = $('btn-save-employee');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  let photoUrl = null;

  // Subir foto si hay — normalizar siempre a JPEG para compatibilidad
  if (selectedPhotoFile) {
    let fileToUpload = selectedPhotoFile;

    // Convertir a JPEG via canvas (maneja .jfif, .webp, .png, etc.)
    try {
      fileToUpload = await normalizeImageToJpeg(selectedPhotoFile);
    } catch (convErr) {
      console.warn('No se pudo convertir la imagen, se sube el original:', convErr);
    }

    const path = `${companyId}/${Date.now()}.jpg`;
    const { data: upload, error: uploadErr } = await supabase.storage
      .from('employee-photos')
      .upload(path, fileToUpload, { upsert: true, contentType: 'image/jpeg' });

    if (uploadErr) {
      showFeedback('emp-feedback', `Error al subir foto: ${uploadErr.message}`, 'error');
      btn.disabled = false;
      btn.textContent = '💾 Guardar empleado';
      return;
    }

    const { data: urlData } = supabase.storage.from('employee-photos').getPublicUrl(upload.path);
    photoUrl = urlData.publicUrl;
  }

  const payload = { company_id: companyId, name, role, section_id: sectionId, rarity };
  if (photoUrl) payload.photo_url = photoUrl;

  let error;
  if (editingEmployeeId) {
    ({ error } = await supabase.from('employees').update(payload).eq('id', editingEmployeeId));
  } else {
    // Generar código vía RPC
    const { data: generatedCode, error: rpcErr } = await supabase.rpc('fn_generate_employee_code', { p_company_id: companyId });
    if (rpcErr) {
      showFeedback('emp-feedback', `Error al generar código: ${rpcErr.message}`, 'error');
      btn.disabled = false;
      btn.textContent = '💾 Guardar empleado';
      return;
    }
    payload.code = generatedCode;
    ({ error } = await supabase.from('employees').insert(payload));
  }

  btn.disabled = false;
  btn.textContent = '💾 Guardar empleado';

  if (error) return showFeedback('emp-feedback', error.message, 'error');

  showFeedback('emp-feedback', editingEmployeeId ? '✅ Empleado actualizado' : '✅ Empleado agregado', 'success');
  cancelEmployeeEdit();
  await loadEmployees();
  loadStats();
  loadLayoutPreview();
}

function editEmployee(id) {
  const emp = employees.find(e => e.id === id);
  if (!emp) return;

  editingEmployeeId = id;

  $('input-emp-name').value = emp.name;
  $('input-emp-role').value = emp.role || '';
  $('input-emp-section').value = emp.section_id || '';
  $('input-emp-rarity').value = emp.rarity;

  if (emp.photo_url) showPhotoPreview(emp.photo_url);

  $('btn-save-employee').textContent = '💾 Actualizar empleado';
  $('btn-cancel-employee').style.display = 'inline-flex';

  $('form-employee-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
  activateSection('empleados');
}

function cancelEmployeeEdit() {
  editingEmployeeId = null;
  $('input-emp-name').value = '';
  $('input-emp-role').value = '';
  $('input-emp-section').value = '';
  $('input-emp-rarity').value = 'common';
  resetPhotoPreview();
  $('btn-save-employee').textContent = '💾 Guardar empleado';
  $('btn-cancel-employee').style.display = 'none';
}

async function deleteEmployee(id) {
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (!error) { await loadEmployees(); loadStats(); loadLayoutPreview(); }
}

// ══════════════════════════════════════════════
//   LAYOUT PREVIEW
// ══════════════════════════════════════════════
function loadLayoutPreview() {
  const container = $('layout-preview');
  const active = employees.filter(e => e.is_active && e.page_number);

  if (!active.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">📐</div>
        <div class="empty-state-title">Layout no publicado</div>
        <div class="empty-state-text">Pulsa "Publicar álbum" para asignar páginas y posiciones.</div>
      </div>`;
    return;
  }

  const maxPage = Math.max(...active.map(e => e.page_number));

  // Detect which pages are section covers
  const pageSectionMap = {};
  active.forEach(e => {
    if (!pageSectionMap[e.page_number]) pageSectionMap[e.page_number] = e.section_id;
  });
  const seenSections = new Set();
  const sectionCoverPages = new Set();
  for (let p = 1; p <= maxPage; p++) {
    const secId = pageSectionMap[p];
    if (secId && !seenSections.has(secId)) {
      seenSections.add(secId);
      sectionCoverPages.add(p);
    }
  }

  let html = '';

  for (let p = 1; p <= maxPage; p++) {
    const pageEmps = active.filter(e => e.page_number === p);
    const isCover = sectionCoverPages.has(p);
    const slotCount = isCover ? 6 : 9;
    const cols = 3;
    const sec = sections.find(s => s.id === pageSectionMap[p]);
    const label = isCover && sec ? `📘 ${sec.name}` : `Página ${p}`;

    const slots = Array.from({ length: slotCount }, (_, i) => {
      const emp = pageEmps.find(e => e.position === i + 1);
      return emp
        ? `<div class="page-slot filled" title="${emp.name}">${emp.name.split(' ')[0]}</div>`
        : `<div class="page-slot">${i + 1}</div>`;
    }).join('');

    html += `
      <div class="page-preview">
        <div class="page-preview-header">${label}</div>
        <div class="page-preview-grid" style="grid-template-columns: repeat(${cols}, 1fr);">${slots}</div>
      </div>`;
  }

  container.innerHTML = html;
}

function setupLayoutPublish() {
  $('btn-publish').addEventListener('click', async () => {
    const btn = $('btn-publish');
    btn.disabled = true;
    btn.textContent = '⏳ Publicando...';

    const { error } = await supabase.rpc('fn_compute_album_layout', { p_company_id: companyId });

    btn.disabled = false;
    btn.textContent = '🚀 Publicar álbum';

    if (error) return showFeedback('layout-feedback', error.message, 'error');
    showFeedback('layout-feedback', '✅ ¡Álbum publicado! Las páginas han sido asignadas.', 'success');
    await loadEmployees();
    loadLayoutPreview();
    loadStats();
  });
}

// ══════════════════════════════════════════════
//   PACK CONFIG
// ══════════════════════════════════════════════
async function loadPackConfig() {
  const { data } = await supabase
    .from('pack_config')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!data) return;

  $('input-pack-size').value = data.pack_size;
  $('input-freq-days').value = data.frequency_days;
  $('input-max-acc').value = data.max_accumulated;

  const probs = data.probabilities || {};
  $('slider-common').value = Math.round((probs.common || 0.7) * 100);
  $('slider-rare').value = Math.round((probs.rare || 0.25) * 100);
  $('slider-legendary').value = Math.round((probs.legendary || 0.05) * 100);
  updateProbLabels();
}

function setupPackConfig() {
  ['slider-common', 'slider-rare', 'slider-legendary'].forEach(id => {
    $(id).addEventListener('input', updateProbLabels);
  });

  $('btn-save-packs').addEventListener('click', savePackConfig);
}

function updateProbLabels() {
  const c = parseInt($('slider-common').value);
  const r = parseInt($('slider-rare').value);
  const l = parseInt($('slider-legendary').value);
  const total = c + r + l;

  $('val-common').textContent = `${c}%`;
  $('val-rare').textContent = `${r}%`;
  $('val-legendary').textContent = `${l}%`;

  const el = $('prob-total');
  el.textContent = `Total: ${total}% ${total === 100 ? '✓' : '⚠ Debe sumar 100%'}`;
  el.className = `prob-total ${total === 100 ? 'ok' : 'error'}`;
}

async function savePackConfig() {
  const c = parseInt($('slider-common').value) / 100;
  const r = parseInt($('slider-rare').value) / 100;
  const l = parseInt($('slider-legendary').value) / 100;

  if (Math.round((c + r + l) * 100) !== 100) {
    return showFeedback('packs-feedback', '⚠ Las probabilidades deben sumar exactamente 100%.', 'error');
  }

  const { error } = await supabase.from('pack_config')
    .update({
      pack_size: parseInt($('input-pack-size').value),
      frequency_days: parseInt($('input-freq-days').value),
      max_accumulated: parseInt($('input-max-acc').value),
      probabilities: { common: c, rare: r, legendary: l }
    })
    .eq('company_id', companyId);

  if (error) return showFeedback('packs-feedback', error.message, 'error');
  showFeedback('packs-feedback', '✅ Configuración de packs guardada.', 'success');
}

// ══════════════════════════════════════════════
//   THEME
// ══════════════════════════════════════════════
async function loadTheme() {
  const { data } = await supabase
    .from('album_theme')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!data) return;

  const map = {
    'cp-page-bg':       data.page_bg_color,
    'cp-page-border':   data.page_border_color,
    'cp-sticker-empty': data.sticker_empty_bg,
    'cp-sticker-filled':data.sticker_filled_border,
    'cp-text-primary':  data.primary_text_color,
    'cp-text-secondary':data.secondary_text_color,
    'cp-accent':        data.accent_color,
    'cp-spine':         data.spine_color,
  };

  Object.entries(map).forEach(([id, val]) => {
    if (val && $(id)) $(id).value = val;
  });

  if (data.cover_image_url) {
    $('preview-cover-link').style.display = 'block';
    $('preview-cover-link').querySelector('a').href = data.cover_image_url;
  }
  if (data.inner_cover_image_url) {
    $('preview-innercover-link').style.display = 'block';
    $('preview-innercover-link').querySelector('a').href = data.inner_cover_image_url;
  }
  if (data.back_cover_image_url) {
    $('preview-backcover-link').style.display = 'block';
    $('preview-backcover-link').querySelector('a').href = data.back_cover_image_url;
  }
  if (data.back_inner_image_url) {
    $('preview-backinner-link').style.display = 'block';
    $('preview-backinner-link').querySelector('a').href = data.back_inner_image_url;
  }
  
  if (data.page_backgrounds) {
    const container = $('page-bgs-container');
    container.innerHTML = '';
    Object.entries(data.page_backgrounds).forEach(([pageNum, url]) => {
      addPageBgRow(pageNum, url);
    });
  }
}

function addPageBgRow(pageNum = '', currentUrl = null) {
  const container = $('page-bgs-container');
  const row = document.createElement('div');
  row.className = 'page-bg-row';
  row.style.cssText = 'display: flex; gap: var(--space-sm); align-items: center; border: 1px solid var(--border-light); padding: 8px; border-radius: var(--radius-sm);';
  
  let linkHtml = currentUrl ? `<a href="${currentUrl}" target="_blank" style="font-size:0.8rem; color:var(--primary); margin-left:8px;" data-current="${currentUrl}">🔗 Ver actual</a>` : '';

  row.innerHTML = `
    <input type="number" class="form-input page-bg-num" placeholder="Pág N°" value="${pageNum}" min="1" style="width: 80px;">
    <input type="file" class="form-input page-bg-file" accept="image/*" style="flex:1;">
    ${linkHtml}
    <button class="btn btn-danger btn-sm btn-remove-bg">❌</button>
  `;

  row.querySelector('.btn-remove-bg').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function setupTheme() {
  $('btn-save-theme').addEventListener('click', saveTheme);
  $('btn-add-page-bg')?.addEventListener('click', () => addPageBgRow());
}

async function uploadBackgroundFile(file) {
  if (!file) return null;
  const path = `${companyId}/${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const { data: upload, error: uploadErr } = await supabase.storage
    .from('album-backgrounds')
    .upload(path, file, { upsert: true });

  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage.from('album-backgrounds').getPublicUrl(upload.path);
  return urlData.publicUrl;
}

async function saveTheme() {
  const btn = $('btn-save-theme');
  btn.disabled = true;
  btn.textContent = '⏳ Subiendo y guardando...';

  try {
    let coverUrl = $('preview-cover-link')?.querySelector('a')?.href || null;
    const coverFile = $('input-cover-file')?.files[0];
    if (coverFile) coverUrl = await uploadBackgroundFile(coverFile);

    let innerCoverUrl = $('preview-innercover-link')?.querySelector('a')?.href || null;
    const innerCoverFile = $('input-innercover-file')?.files[0];
    if (innerCoverFile) innerCoverUrl = await uploadBackgroundFile(innerCoverFile);

    let backCoverUrl = $('preview-backcover-link')?.querySelector('a')?.href || null;
    const backCoverFile = $('input-backcover-file')?.files[0];
    if (backCoverFile) backCoverUrl = await uploadBackgroundFile(backCoverFile);

    let backInnerUrl = $('preview-backinner-link')?.querySelector('a')?.href || null;
    const backInnerFile = $('input-backinner-file')?.files[0];
    if (backInnerFile) backInnerUrl = await uploadBackgroundFile(backInnerFile);

    let pageBgs = {};
    const bgRows = document.querySelectorAll('.page-bg-row');
    for (const row of bgRows) {
      const pageNum = row.querySelector('.page-bg-num').value.trim();
      const fileInput = row.querySelector('.page-bg-file');
      const currentLink = row.querySelector('a[data-current]');
      
      if (!pageNum) continue;

      if (fileInput.files.length > 0) {
        pageBgs[pageNum] = await uploadBackgroundFile(fileInput.files[0]);
      } else if (currentLink) {
        pageBgs[pageNum] = currentLink.getAttribute('data-current');
      }
    }

    const { error } = await supabase.from('album_theme')
      .update({
        page_bg_color:         $('cp-page-bg').value,
        page_border_color:     $('cp-page-border').value,
        sticker_empty_bg:      $('cp-sticker-empty').value,
        sticker_filled_border: $('cp-sticker-filled').value,
        primary_text_color:    $('cp-text-primary').value,
        secondary_text_color:  $('cp-text-secondary').value,
        accent_color:          $('cp-accent').value,
        spine_color:           $('cp-spine').value,
        cover_image_url:       coverUrl,
        inner_cover_image_url: innerCoverUrl,
        back_cover_image_url:  backCoverUrl,
        back_inner_image_url:  backInnerUrl,
        page_backgrounds:      pageBgs
      })
      .eq('company_id', companyId);

    if (error) throw error;
    
    // Refresh to show updated UI state (links)
    await loadTheme();
    showFeedback('theme-feedback', '✅ Tema guardado correctamente.', 'success');

  } catch (err) {
    showFeedback('theme-feedback', err.message || 'Error al guardar el tema.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar tema';
  }
}
// ══════════════════════════════════════════════
//   HELPERS
// ══════════════════════════════════════════════
function showFeedback(id, msg, type = 'error') {
  const el = $(id);
  el.textContent = msg;
  el.className = `feedback visible feedback-${type}`;
  setTimeout(() => el.classList.remove('visible'), 5000);
}

/**
 * Convierte cualquier imagen (incluyendo .jfif, .webp, .bmp) a un Blob JPEG
 * usando un elemento <canvas> para re-codificar.
 */
function normalizeImageToJpeg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob falló'));
      }, 'image/jpeg', 0.88);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen'));
    };

    img.src = url;
  });
}

// ── Boot ──
init();
