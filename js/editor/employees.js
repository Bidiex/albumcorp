/**
 * employees.js — Orquestador del Panel del Editor
 * Gestiona: navegación, carga inicial, empleados, secciones, layout, packs, tema
 */
import { supabase } from '../core/supabase.js';
import { guardRoute, logoutUser } from '../core/auth.js';
import { initThemeEditor } from './theme-editor.js';
import * as XLSX from 'xlsx';
import { initTour } from './tour.js';

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

  let needsOnboarding = false;
  let companyName = '';
  let companySlug = '';

  if (!companyId) {
    needsOnboarding = true;
  } else {
    // Cargar nombre empresa
    const { data: company } = await supabase
      .from('companies')
      .select('name, slug')
      .eq('id', companyId)
      .single();

    if (!company || company.name === 'Mi Empresa' || !company.name.trim()) {
      needsOnboarding = true;
      if (company) {
        companyName = company.name;
        companySlug = company.slug;
      }
    } else {
      companyName = company.name;
      companySlug = company.slug;
    }
  }

  if (needsOnboarding) {
    // Mostrar modal bloqueante y configurar el submit
    $('loading-overlay').style.display = 'none';
    $('onboarding-modal').style.display = 'flex';
    
    // Rellenar con datos actuales si existen y son diferentes a los provisionales
    $('onboard-editor-name').value = (profile.display_name && profile.display_name !== profile.email) ? profile.display_name : '';
    if (companyName && companyName !== 'Mi Empresa') {
      $('onboard-company-name').value = companyName;
    }

    $('form-onboarding').addEventListener('submit', async (e) => {
      e.preventDefault();
      const onboardBtn = $('btn-onboard-submit');
      const onboardFeedback = $('onboard-feedback');
      const inputEditorName = $('onboard-editor-name').value.trim();
      const inputCompanyName = $('onboard-company-name').value.trim();

      if (!inputEditorName || !inputCompanyName) {
        showFeedback('onboard-feedback', 'Todos los campos son obligatorios.', 'error');
        return;
      }

      onboardBtn.disabled = true;
      onboardBtn.textContent = '⏳ Configurando...';

      try {
        let finalCompanyId = companyId;
        const slug = inputCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        if (!finalCompanyId) {
          // Usar la RPC fn_register_editor para crear la empresa y asociar el perfil atómicamente
          const { data: regData, error: regError } = await supabase.rpc('fn_register_editor', {
            p_company_name: inputCompanyName,
            p_editor_name: inputEditorName,
            p_user_id: profile.id
          });

          if (regError) throw regError;
          finalCompanyId = regData.company_id;
          companyName = regData.company_name;
          companySlug = regData.slug;

        } else {
          // Ya tiene company_id pero el nombre era provisional
          const { error: companyUpdateErr } = await supabase
            .from('companies')
            .update({ name: inputCompanyName, slug })
            .eq('id', finalCompanyId);

          if (companyUpdateErr) throw companyUpdateErr;
          companyName = inputCompanyName;
          companySlug = slug;

          const { error: profileError } = await supabase
            .from('user_profiles')
            .update({ display_name: inputEditorName })
            .eq('id', profile.id);

          if (profileError) throw profileError;
        }

        // Actualizar variables de sesión locales
        companyId = finalCompanyId;
        profile.display_name = inputEditorName;

        // Ocultar modal, mostrar app
        $('onboarding-modal').style.display = 'none';
        $('app').style.display = 'flex';

        // Poblar UI de sesión
        $('sidebar-user-name').textContent = inputEditorName;
        $('sidebar-avatar').textContent = inputEditorName.charAt(0).toUpperCase();
        $('sidebar-company-name').textContent = companyName;
        $('join-link').textContent = `${location.origin}/join.html?slug=${companySlug}`;

        // Continuar inicialización normal
        await continueInit();

      } catch (err) {
        console.error('Error en onboarding:', err);
        showFeedback('onboard-feedback', err.message || 'Error al guardar la configuración.', 'error');
      } finally {
        onboardBtn.disabled = false;
        onboardBtn.textContent = 'Guardar y Activar Panel';
      }
    });

  } else {
    // Si no necesita onboarding, continuar inicio normal
    // Ocultar loading, mostrar app
    $('loading-overlay').style.display = 'none';
    $('app').style.display = 'flex';

    // Poblar UI de sesión
    const name = profile.display_name || 'Editor';
    $('sidebar-user-name').textContent = name;
    $('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
    $('sidebar-company-name').textContent = companyName;
    $('join-link').textContent = `${location.origin}/join.html?slug=${companySlug}`;

    await continueInit();
  }
}

async function continueInit() {
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
  setupAccesos();
  loadAccesos();
  loadAccessRequests();
  setupGrants();
  loadGrantSection();
  setupMilestones();
  loadMilestones();
  initTour();
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
  if (name === 'ranking') loadEditorRanking();
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
  confirmAction(
    '¿Eliminar esta sección? Los empleados asociados quedarán sin sección asignada.',
    async () => {
      const { error } = await supabase.from('album_sections').delete().eq('id', id);
      if (!error) {
        await loadSections();
        await loadEmployees();
      }
    }
  );
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
  return { common: '⬜ Común', rare: '💜 Mítica', legendary: '⭐ Legendario' }[r] || r;
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
let selectedPlaceholderFile = null;

function setupEmployeeForm() {
  setupPhotoUpload();
  setupEmployeeFilters();

  $('btn-save-employee').addEventListener('click', saveEmployee);
  $('btn-cancel-employee').addEventListener('click', cancelEmployeeEdit);
}

function setupPhotoUpload() {
  const inputPhoto = $('input-photo');
  const areaPhoto = $('photo-drop-area');

  inputPhoto.addEventListener('change', () => {
    const file = inputPhoto.files[0];
    if (!file) return;
    selectedPhotoFile = file;
    showPhotoPreview(URL.createObjectURL(file), 'photo-preview-container');
  });

  areaPhoto.addEventListener('dragover', (e) => { e.preventDefault(); areaPhoto.style.borderColor = 'var(--primary)'; });
  areaPhoto.addEventListener('dragleave', () => { areaPhoto.style.borderColor = ''; });
  areaPhoto.addEventListener('drop', (e) => {
    e.preventDefault();
    areaPhoto.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      selectedPhotoFile = file;
      showPhotoPreview(URL.createObjectURL(file), 'photo-preview-container');
    }
  });

  // Placeholder upload
  const inputPlaceholder = $('input-placeholder');
  const areaPlaceholder = $('placeholder-drop-area');

  inputPlaceholder.addEventListener('change', () => {
    const file = inputPlaceholder.files[0];
    if (!file) return;
    selectedPlaceholderFile = file;
    showPhotoPreview(URL.createObjectURL(file), 'placeholder-preview-container');
  });

  areaPlaceholder.addEventListener('dragover', (e) => { e.preventDefault(); areaPlaceholder.style.borderColor = 'var(--primary)'; });
  areaPlaceholder.addEventListener('dragleave', () => { areaPlaceholder.style.borderColor = ''; });
  areaPlaceholder.addEventListener('drop', (e) => {
    e.preventDefault();
    areaPlaceholder.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      selectedPlaceholderFile = file;
      showPhotoPreview(URL.createObjectURL(file), 'placeholder-preview-container');
    }
  });
}

function showPhotoPreview(url, containerId = 'photo-preview-container') {
  $(containerId).innerHTML = `<img src="${url}" class="photo-upload-preview" alt="Preview">`;
}

function resetPhotoPreview() {
  $('photo-preview-container').innerHTML = `
    <span style="font-size:2rem;">📷</span>
    <span class="photo-upload-hint">Foto</span>`;
  selectedPhotoFile = null;
  $('input-photo').value = '';

  $('placeholder-preview-container').innerHTML = `
    <span style="font-size:2rem;">👤</span>
    <span class="photo-upload-hint">Base</span>`;
  selectedPlaceholderFile = null;
  $('input-placeholder').value = '';
}

async function saveEmployee() {
  const name = $('input-emp-name').value.trim();
  const sectionId = $('input-emp-section').value || null;
  const rarity = $('input-emp-rarity').value;

  if (!name) {
    return showFeedback('emp-feedback', 'El nombre es obligatorio.', 'error');
  }

  if (!editingEmployeeId) {
    if (!selectedPhotoFile) return showFeedback('emp-feedback', 'La foto de la laminita es obligatoria.', 'error');
    if (!selectedPlaceholderFile) return showFeedback('emp-feedback', 'La silueta/base es obligatoria.', 'error');
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

  let placeholderUrl = null;
  if (selectedPlaceholderFile) {
    let fileToUpload = selectedPlaceholderFile;
    try { fileToUpload = await normalizeImageToJpeg(selectedPlaceholderFile); } catch (e) {}

    const path = `${companyId}/ph_${Date.now()}.jpg`;
    const { data: upload, error: uploadErr } = await supabase.storage
      .from('employee-photos')
      .upload(path, fileToUpload, { upsert: true, contentType: 'image/jpeg' });

    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('employee-photos').getPublicUrl(upload.path);
      placeholderUrl = urlData.publicUrl;
    }
  }

  const payload = { company_id: companyId, name, section_id: sectionId, rarity };
  if (photoUrl !== null) payload.photo_url = photoUrl;
  if (placeholderUrl !== null) payload.placeholder_url = placeholderUrl;

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
  $('input-emp-section').value = emp.section_id || '';
  $('input-emp-rarity').value = emp.rarity;

  if (emp.photo_url) {
    showPhotoPreview(emp.photo_url, 'photo-preview-container');
    selectedPhotoFile = null;
  } else {
    resetPhotoPreview(); // Also resets placeholder
  }

  if (emp.placeholder_url) {
    showPhotoPreview(emp.placeholder_url, 'placeholder-preview-container');
    selectedPlaceholderFile = null;
  }

  $('btn-save-employee').textContent = '💾 Actualizar empleado';
  $('btn-cancel-employee').style.display = 'inline-flex';

  $('form-employee-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
  activateSection('empleados');
}

function cancelEmployeeEdit() {
  editingEmployeeId = null;
  $('input-emp-name').value = '';
  $('input-emp-section').value = '';
  $('input-emp-rarity').value = 'common';
  resetPhotoPreview();
  $('btn-save-employee').textContent = '💾 Guardar empleado';
  $('btn-cancel-employee').style.display = 'none';
}

async function deleteEmployee(id) {
  confirmAction(
    '¿Eliminar esta laminita permanentemente? Esta acción no se puede deshacer.',
    async () => {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (!error) await loadEmployees();
    }
  );
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
  $('slider-common').value = Math.round((probs.common || 0.8) * 100);
  $('slider-rare').value = Math.round((probs.rare || 0.2) * 100);
  updateProbLabels();
}

function setupPackConfig() {
  $('slider-common').addEventListener('input', () => {
    $('slider-rare').value = 100 - parseInt($('slider-common').value);
    updateProbLabels();
  });
  $('slider-rare').addEventListener('input', () => {
    $('slider-common').value = 100 - parseInt($('slider-rare').value);
    updateProbLabels();
  });

  $('btn-save-packs').addEventListener('click', savePackConfig);
}

function updateProbLabels() {
  const c = parseInt($('slider-common').value);
  const r = parseInt($('slider-rare').value);
  const total = c + r;

  $('val-common').textContent = `${c}%`;
  $('val-rare').textContent = `${r}%`;

  const el = $('prob-total');
  el.textContent = `Total: ${total}% ${total === 100 ? '✓' : '⚠ Debe sumar 100%'}`;
  el.className = `prob-total ${total === 100 ? 'ok' : 'error'}`;
}

async function savePackConfig() {
  const c = parseInt($('slider-common').value) / 100;
  const r = parseInt($('slider-rare').value) / 100;

  if (Math.round((c + r) * 100) !== 100) {
    return showFeedback('packs-feedback', '⚠ Las probabilidades deben sumar exactamente 100%.', 'error');
  }

  const { error } = await supabase.from('pack_config')
    .update({
      pack_size: parseInt($('input-pack-size').value),
      frequency_days: parseInt($('input-freq-days').value),
      max_accumulated: parseInt($('input-max-acc').value),
      probabilities: { common: c, rare: r, legendary: 0 }
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

  // Inicializar theme-editor.js con los datos del tema actual y las secciones cargadas
  initThemeEditor(companyId, data, sections);

  // Cargar fondos de página interiores
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

  row.querySelector('.btn-remove-bg').addEventListener('click', () => {
    confirmAction(
      '¿Eliminar este fondo de página de la lista?',
      () => row.remove()
    );
  });
  container.appendChild(row);
}

function setupTheme() {
  $('btn-add-page-bg')?.addEventListener('click', () => addPageBgRow());
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

// ══════════════════════════════════════════════
//   ACCESOS
// ══════════════════════════════════════════════
function setupAccesos() {
  document.getElementById('btn-add-email')
    ?.addEventListener('click', addEmail);

  document.getElementById('btn-import-xlsx')
    ?.addEventListener('click', importAllowedEmailsFromXlsx);

  document.querySelectorAll('.accesos-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Determinar el scope: tabs de #section-accesos o #section-ranking
      const parentSection = tab.closest('.editor-section');
      const tabsInSection = parentSection
        ? parentSection.querySelectorAll('.accesos-tab')
        : document.querySelectorAll('.accesos-tab');
      const panelsInSection = parentSection
        ? parentSection.querySelectorAll('.accesos-panel')
        : document.querySelectorAll('.accesos-panel');

      tabsInSection.forEach(t => t.classList.remove('accesos-tab--active'));
      panelsInSection.forEach(p => p.classList.remove('accesos-panel--active'));

      tab.classList.add('accesos-tab--active');
      const panelId = 'panel-' + tab.dataset.tab;
      document.getElementById(panelId)
        ?.classList.add('accesos-panel--active');

      if (tab.dataset.tab === 'legendarias') {
        loadGrantSection();
      }
      if (tab.dataset.tab === 'solicitudes') {
        loadAccessRequests();
      }
      if (tab.dataset.tab === 'ranking-list') {
        loadEditorRanking();
      }
    });
  });
}

let _accesosData = [];

async function loadAccesos() {
  const list = document.getElementById('emails-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Cargando...</p>';

  const { data, error } = await supabase
    .rpc('fn_get_allowed_emails_with_profiles', {
      p_company_id: companyId
    });

  if (error || !data || data.length === 0) {
    _accesosData = [];
    list.innerHTML =
      '<p class="empty-state">No hay correos autorizados aún.</p>';
    return;
  }

  _accesosData = data;
  renderAccesosList(data);

  // Conectar buscador (solo la primera vez)
  const searchInput = document.getElementById('input-search-email');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = q
        ? _accesosData.filter(d =>
            d.email.toLowerCase().includes(q) ||
            (d.display_name && d.display_name.toLowerCase().includes(q))
          )
        : _accesosData;
      renderAccesosList(filtered);
    });
  }
}

function renderAccesosList(data) {
  const list = document.getElementById('emails-list');
  if (!list) return;

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin resultados.</p>';
    return;
  }

  list.innerHTML = `
    <div class="emails-table-container">
      <table class="emails-table">
        <thead>
          <tr>
            <th>Correo electrónico</th>
            <th>Nombre / Estado</th>
            <th class="actions">Acción</th>
          </tr>
        </thead>
        <tbody id="emails-table-body">
        </tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('emails-table-body');
  data.forEach(({ id, email, display_name, is_registered }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="email-row__text" style="font-weight: 500;">${email}</span></td>
      <td>
        <span class="email-row__name ${is_registered ? 'email-row__name--registered' : 'email-row__name--pending'}">
          ${is_registered ? `🟢 ${display_name}` : '⏳ Sin registrar'}
        </span>
      </td>
      <td class="actions">
        <button class="email-row__delete" data-id="${id}">✕</button>
      </td>
    `;
    tr.querySelector('.email-row__delete')
      .addEventListener('click', () => deleteEmail(id));
    tbody.appendChild(tr);
  });
}

async function importAllowedEmailsFromXlsx() {
  const fileInput = document.getElementById('input-xlsx-file');
  const btn = document.getElementById('btn-import-xlsx');
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showFeedback('accesos-feedback', 'Por favor, selecciona un archivo Excel (.xlsx o .xls).', 'error');
    return;
  }

  const file = fileInput.files[0];
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '⏳ Importando...';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      if (workbook.SheetNames.length === 0) {
        throw new Error('El archivo Excel está vacío.');
      }
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const emails = [];
      
      json.forEach(row => {
        if (row && row[0]) {
          const email = String(row[0]).trim().toLowerCase();
          if (email && email.includes('@') && email.split('@')[1].includes('.')) {
            emails.push(email);
          }
        }
      });

      if (emails.length === 0) {
        showFeedback('accesos-feedback', 'No se encontraron correos válidos en la columna A.', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      // Check against existing emails
      const existingEmails = new Set(_accesosData.map(d => d.email.toLowerCase().trim()));
      const newEmails = [...new Set(emails.filter(email => !existingEmails.has(email)))];

      if (newEmails.length === 0) {
        showFeedback('accesos-feedback', 'Todos los correos válidos del archivo ya están autorizados.', 'warning');
        btn.disabled = false;
        btn.textContent = originalText;
        fileInput.value = '';
        return;
      }

      const payloads = newEmails.map(email => ({
        company_id: companyId,
        email
      }));

      const { error } = await supabase
        .from('allowed_emails')
        .insert(payloads);

      if (error) throw error;

      showFeedback('accesos-feedback', `✓ Se importaron ${newEmails.length} correos correctamente.`, 'success');
      fileInput.value = '';
      loadAccesos();

    } catch (err) {
      showFeedback('accesos-feedback', 'Error al leer/guardar el archivo: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  reader.onerror = () => {
    showFeedback('accesos-feedback', 'Error al leer el archivo.', 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  };

  reader.readAsArrayBuffer(file);
}

async function addEmail() {
  const input = document.getElementById('input-new-email');
  const feedback = document.getElementById('accesos-feedback');
  const email = input?.value?.trim().toLowerCase();
  if (!email) return;

  const { error } = await supabase
    .from('allowed_emails')
    .insert({ company_id: companyId, email });

  if (error) {
    if (error.code === '23505') {
      showFeedback('accesos-feedback', 
        'Este correo ya está en la lista.', 'error');
    } else {
      showFeedback('accesos-feedback', 
        error.message, 'error');
    }
    return;
  }

  input.value = '';
  showFeedback('accesos-feedback', 
    '✓ Correo agregado correctamente.', 'success');
  loadAccesos();
}

async function deleteEmail(id) {
  confirmAction(
    '¿Eliminar este correo de la lista de acceso? El usuario perderá acceso al álbum.',
    async () => {
      const { error } = await supabase
        .from('allowed_emails')
        .delete()
        .eq('id', id);
      if (!error) loadAccesos();
    }
  );
}

async function loadGrantSection() {
  await loadUsersForGrant();
  await loadLegendariesForGrant();
  await loadGrantsList();
}

async function loadUsersForGrant() {
  const select = document.getElementById('select-grant-user');
  if (!select) return;

  const { data } = await supabase
    .from('user_profiles')
    .select('id, display_name')
    .eq('company_id', companyId)
    .eq('role', 'employee')
    .order('display_name');

  if (!data || data.length === 0) {
    select.innerHTML = '<option value="">Sin usuarios registrados</option>';
    return;
  }

  select.innerHTML = '<option value="">— Seleccionar usuario —</option>';
  data.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.display_name;
    select.appendChild(opt);
  });
}

async function loadLegendariesForGrant() {
  const select = document.getElementById('select-grant-legendary');
  if (!select) return;

  const { data } = await supabase
    .from('employees')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('rarity', 'legendary')
    .eq('is_active', true)
    .order('name');

  if (!data || data.length === 0) {
    select.innerHTML = '<option value="">Sin laminitas legendarias</option>';
    return;
  }

  select.innerHTML = '<option value="">— Seleccionar laminita —</option>';
  data.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    select.appendChild(opt);
  });
}

let _grantsData = [];

async function loadGrantsList() {
  const list = document.getElementById('grants-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Cargando...</p>';

  const { data, error } = await supabase
    .rpc('fn_get_grants_list', { p_company_id: companyId });

  if (error || !data || data.length === 0) {
    _grantsData = [];
    list.innerHTML = '<p class="empty-state">No hay legendarias otorgadas aún.</p>';
    return;
  }

  _grantsData = data;
  renderGrantsList(data);

  // Conectar buscador
  const searchInput = document.getElementById('input-search-grant');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = q
        ? _grantsData.filter(d =>
            (d.employee_name && d.employee_name.toLowerCase().includes(q)) ||
            (d.user_display_name && d.user_display_name.toLowerCase().includes(q))
          )
        : _grantsData;
      renderGrantsList(filtered);
    });
  }
}

function renderGrantsList(data) {
  const list = document.getElementById('grants-list');
  if (!list) return;

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin resultados.</p>';
    return;
  }

  list.innerHTML = `
    <div class="emails-table-container">
      <table class="emails-table">
        <thead>
          <tr>
            <th>Laminita Legendaria</th>
            <th>Otorgada a</th>
            <th>Fecha de Asignación</th>
            <th class="actions" style="text-align: right;">Acción</th>
          </tr>
        </thead>
        <tbody id="grants-table-body">
        </tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('grants-table-body');
  data.forEach(grant => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="font-weight: 600; color: var(--warning-dark);">⭐ ${grant.employee_name || '?'}</span></td>
      <td><span style="font-weight: 500;">👤 ${grant.user_display_name || '?'}</span></td>
      <td>
        <span style="font-size: 0.85rem; color: var(--text-secondary);">
          ${new Date(grant.granted_at).toLocaleDateString('es-CO')}
        </span>
      </td>
      <td class="actions" style="text-align: right;">
        <button class="email-row__delete" style="padding: 4px 8px; box-shadow: none;" data-id="${grant.id}">✕</button>
      </td>
    `;
    tr.querySelector('.email-row__delete')
      .addEventListener('click', () => revokeGrant(grant.id, grant.employee_id, grant.user_id));
    tbody.appendChild(tr);
  });
}

async function grantLegendary() {
  const userId = document.getElementById('select-grant-user')?.value;
  const empId = document.getElementById('select-grant-legendary')?.value;

  if (!userId || !empId) {
    showFeedback('grant-feedback', 'Selecciona un usuario y una laminita.', 'error');
    return;
  }

  const { error } = await supabase.rpc('fn_grant_legendary', {
    p_employee_id: empId,
    p_user_id: userId
  });

  if (error) {
    showFeedback('grant-feedback', error.message, 'error');
    return;
  }

  showFeedback('grant-feedback', '✓ Laminita otorgada correctamente.', 'success');
  loadGrantsList();
}

async function revokeGrant(grantId, empId, userId) {
  if (!empId || !userId) return;
  confirmAction(
    '¿Revocar esta laminita legendaria? Se eliminará de la colección del usuario.',
    async () => {
      const { error } = await supabase.rpc('fn_revoke_legendary', {
        p_employee_id: empId,
        p_user_id: userId
      });
      if (!error) loadGrantsList();
    }
  );
}

function setupGrants() {
  document.getElementById('btn-grant-legendary')
    ?.addEventListener('click', grantLegendary);
}

let _rankingData = [];

async function loadEditorRanking() {
  const list = document.getElementById('editor-ranking-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Cargando...</p>';

  const { data, error } = await supabase
    .rpc('fn_get_ranking', { p_company_id: companyId });

  if (error || !data || data.length === 0) {
    _rankingData = [];
    list.innerHTML = '<p class="empty-state">Sin datos aún.</p>';
    return;
  }

  _rankingData = data;
  renderEditorRankingList(data);

  // Conectar buscador
  const searchInput = document.getElementById('input-search-ranking');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = q
        ? _rankingData.filter(d =>
            d.display_name && d.display_name.toLowerCase().includes(q)
          )
        : _rankingData;
      renderEditorRankingList(filtered);
    });
  }
}

function renderEditorRankingList(data) {
  const list = document.getElementById('editor-ranking-list');
  if (!list) return;

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin resultados.</p>';
    return;
  }

  list.innerHTML = `
    <div class="emails-table-container">
      <table class="emails-table">
        <thead>
          <tr>
            <th style="width: 100px;">Posición</th>
            <th>Nombre del Empleado</th>
            <th style="text-align: right;">Laminitas Coleccionadas</th>
          </tr>
        </thead>
        <tbody id="ranking-table-body">
        </tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('ranking-table-body');
  data.forEach(entry => {
    const tr = document.createElement('tr');
    const medal =
      entry.position == 1 ? '🥇' :
      entry.position == 2 ? '🥈' :
      entry.position == 3 ? '🥉' : `#${entry.position}`;

    tr.innerHTML = `
      <td><span style="font-family: var(--font-heading); font-weight: 800; font-size: 1.05rem;">${medal}</span></td>
      <td><span style="font-weight: 500;">${entry.display_name}</span></td>
      <td style="text-align: right;">
        <span class="badge badge-rare" style="color: var(--primary-dark); background: var(--surface-soft); border-color: var(--primary); font-size: 0.85rem; font-weight: 800; display: inline-flex;">
          ${entry.stickers_count} laminitas
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ══════════════════════════════════════════════
//   HITOS / MILESTONES
// ══════════════════════════════════════════════

// Archivos seleccionados por nivel (1-4)
const _milestoneFiles = {};
// IDs de los registros existentes en DB (para upsert)
const _milestoneIds   = {};

function setupMilestones() {
  // Listeners de archivo por cada nivel
  for (let level = 1; level <= 4; level++) {
    const fileInput = document.getElementById(`milestone-file-${level}`);
    if (!fileInput) continue;

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      _milestoneFiles[level] = file;

      // Preview inmediato
      const preview = document.getElementById(`milestone-preview-${level}`);
      if (preview) {
        preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview nivel ${level}">`;
      }
    });
  }

  document.getElementById('btn-save-milestones')
    ?.addEventListener('click', saveMilestones);
}

async function loadMilestones() {
  const { data, error } = await supabase
    .rpc('fn_get_milestones_config_editor', { p_company_id: companyId });

  if (error || !data) return;

  data.forEach(m => {
    const level = m.level;
    _milestoneIds[level] = m.id;

    // Poblar threshold
    const thresholdInput = document.getElementById(`milestone-threshold-${level}`);
    if (thresholdInput) thresholdInput.value = m.threshold;

    // Poblar label
    const labelInput = document.getElementById(`milestone-label-${level}`);
    if (labelInput && m.label) labelInput.value = m.label;

    // Preview de imagen actual
    if (m.image_url) {
      const preview = document.getElementById(`milestone-preview-${level}`);
      if (preview) {
        preview.innerHTML = `<img src="${m.image_url}" alt="Medalla nivel ${level}">`;
      }

      const urlWrap = document.getElementById(`milestone-current-url-${level}`);
      if (urlWrap) {
        urlWrap.style.display = 'block';
        const link = urlWrap.querySelector('a');
        if (link) link.href = m.image_url;
      }
    }
  });
}

async function saveMilestones() {
  const btn = document.getElementById('btn-save-milestones');
  btn.disabled = true;
  btn.textContent = '⏳ Guardando...';

  let hasError = false;

  for (let level = 1; level <= 4; level++) {
    const threshold = parseInt(document.getElementById(`milestone-threshold-${level}`)?.value) || 0;
    const label     = document.getElementById(`milestone-label-${level}`)?.value?.trim() || '';

    if (threshold < 1 || threshold > 100) {
      showFeedback('milestones-feedback', `El % del Nivel ${level} debe estar entre 1 y 100.`, 'error');
      hasError = true;
      break;
    }

    let imageUrl = null;

    // Subir imagen si hay archivo nuevo
    if (_milestoneFiles[level]) {
      let fileToUpload = _milestoneFiles[level];
      try { fileToUpload = await normalizeImageToJpeg(_milestoneFiles[level]); } catch (e) {}

      const path = `${companyId}/level_${level}_${Date.now()}.jpg`;
      const { data: upload, error: uploadErr } = await supabase.storage
        .from('milestone-badges')
        .upload(path, fileToUpload, { upsert: true, contentType: 'image/jpeg' });

      if (uploadErr) {
        showFeedback('milestones-feedback', `Error al subir imagen nivel ${level}: ${uploadErr.message}`, 'error');
        hasError = true;
        break;
      }

      const { data: urlData } = supabase.storage
        .from('milestone-badges')
        .getPublicUrl(upload.path);
      imageUrl = urlData.publicUrl;

      // Actualizar preview del link
      const urlWrap = document.getElementById(`milestone-current-url-${level}`);
      if (urlWrap) {
        urlWrap.style.display = 'block';
        const link = urlWrap.querySelector('a');
        if (link) link.href = imageUrl;
      }
    }

    // Upsert en milestone_config
    const payload = {
      company_id: companyId,
      level,
      threshold,
      label,
      updated_at: new Date().toISOString()
    };
    if (imageUrl) payload.image_url = imageUrl;

    const existingId = _milestoneIds[level];

    let dbError;
    if (existingId) {
      // UPDATE
      ({ error: dbError } = await supabase
        .from('milestone_config')
        .update(payload)
        .eq('id', existingId));
    } else {
      // INSERT
      const { data: inserted, error: insertErr } = await supabase
        .from('milestone_config')
        .insert(payload)
        .select('id')
        .single();
      dbError = insertErr;
      if (!insertErr && inserted) {
        _milestoneIds[level] = inserted.id;
      }
    }

    if (dbError) {
      showFeedback('milestones-feedback', `Error en nivel ${level}: ${dbError.message}`, 'error');
      hasError = true;
      break;
    }
  }

  btn.disabled = false;
  btn.textContent = '💾 Guardar hitos';

  if (!hasError) {
    showFeedback('milestones-feedback', '✅ Hitos guardados correctamente.', 'success');
    // Limpiar archivos seleccionados
    for (let level = 1; level <= 4; level++) {
      delete _milestoneFiles[level];
      const fileInput = document.getElementById(`milestone-file-${level}`);
      if (fileInput) fileInput.value = '';
    }
  }
}

function confirmAction(message, onConfirm) {
  const existing = document.getElementById('confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  modal.innerHTML = `
    <div style="
      background: var(--surface);
      border: 2px solid var(--border-main);
      border-radius: var(--radius-lg);
      padding: var(--space-xl);
      max-width: 420px;
      width: 90%;
      box-shadow: var(--shadow-offset-lg);
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    ">
      <p style="
        font-family: var(--font-body);
        font-size: 0.95rem;
        color: var(--text-main);
        margin: 0;
        line-height: 1.5;
      ">${message}</p>
      <div style="display:flex; gap: var(--space-sm); justify-content: flex-end;">
        <button id="confirm-cancel" class="btn btn-ghost">
          Cancelar
        </button>
        <button id="confirm-ok" class="btn btn-primary" 
          style="background: var(--danger); border-color: var(--danger-dark);">
          Eliminar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('confirm-cancel').addEventListener('click', () => {
    modal.remove();
  });

  document.getElementById('confirm-ok').addEventListener('click', () => {
    modal.remove();
    onConfirm();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Expose confirmAction globally so theme-editor.js can use it for row deletions
window.__confirmAction = confirmAction;

let _accessRequestsData = [];

async function loadAccessRequests() {
  const list = document.getElementById('solicitudes-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Cargando...</p>';

  const { data, error } = await supabase
    .rpc('fn_get_access_requests', { p_company_id: companyId });

  if (error || !data || data.length === 0) {
    _accessRequestsData = [];
    list.innerHTML = '<p class="empty-state">No hay solicitudes pendientes.</p>';
    updateSolicitudesBadge(0);
    return;
  }

  const pending = data.filter(r => r.status === 'pending');
  updateSolicitudesBadge(pending.length);

  _accessRequestsData = data;
  renderAccessRequestsList(data);

  // Conectar buscador
  const searchInput = document.getElementById('input-search-request');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = q
        ? _accessRequestsData.filter(d =>
            d.email.toLowerCase().includes(q)
          )
        : _accessRequestsData;
      renderAccessRequestsList(filtered);
    });
  }
}

function renderAccessRequestsList(data) {
  const list = document.getElementById('solicitudes-list');
  if (!list) return;

  if (!data || data.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin resultados.</p>';
    return;
  }

  list.innerHTML = `
    <div class="emails-table-container">
      <table class="emails-table">
        <thead>
          <tr>
            <th>Correo electrónico</th>
            <th>Fecha Solicitud</th>
            <th>Estado</th>
            <th class="actions" style="text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody id="solicitudes-table-body">
        </tbody>
      </table>
    </div>
  `;

  const tbody = document.getElementById('solicitudes-table-body');
  data.forEach(req => {
    const isPending = req.status === 'pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="email-row__text" style="font-weight: 500;">${req.email}</span></td>
      <td>
        <span style="font-size: 0.85rem; color: var(--text-secondary);">
          ${new Date(req.requested_at).toLocaleDateString('es-CO')}
        </span>
      </td>
      <td>
        <span class="email-row__name ${isPending ? 'email-row__name--pending' : 'email-row__name--registered'}">
          ${isPending ? '⏳ Pendiente' : req.status === 'approved' ? '🟢 Aprobada' : '🔴 Rechazada'}
        </span>
      </td>
      <td class="actions" style="text-align: right;">
        ${isPending ? `
          <div style="display:inline-flex; gap:6px; justify-content: flex-end;">
            <button class="btn btn-primary btn-sm req-approve" 
              data-id="${req.id}" data-email="${req.email}"
              style="padding:4px 10px; font-size:0.8rem; box-shadow: none;">
              ✓
            </button>
            <button class="btn btn-ghost btn-sm req-reject"
              data-id="${req.id}"
              style="padding:4px 10px; font-size:0.8rem; color:var(--danger); box-shadow: none;">
              ✕
            </button>
          </div>
        ` : '—'}
      </td>
    `;

    if (isPending) {
      tr.querySelector('.req-approve').addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const email = e.currentTarget.dataset.email;
        const { error } = await supabase.rpc('fn_approve_access_request', {
          p_request_id: id
        });
        if (!error) {
          showFeedback('solicitudes-feedback', `✓ ${email} aprobado y agregado a la lista.`, 'success');
          loadAccessRequests();
          loadAccesos();
        }
      });

      tr.querySelector('.req-reject').addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const { error } = await supabase.rpc('fn_reject_access_request', {
          p_request_id: id
        });
        if (!error) loadAccessRequests();
      });
    }

    tbody.appendChild(tr);
  });
}

function updateSolicitudesBadge(count) {
  const badge = document.getElementById('solicitudes-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Boot ──
init();
