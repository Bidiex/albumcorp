/**
 * milestones.js — Módulo de Hitos / Medallero
 *
 * Responsabilidades:
 *  1. Cargar configuración de hitos de la empresa y logros del usuario
 *  2. Detectar nuevos logros al cambiar el progreso del usuario
 *  3. Mostrar el modal épico de hito desbloqueado (una sola vez)
 *  4. Renderizar el "Pase de Batalla" dentro del modal de Ranking
 */

import { supabase } from '../core/supabase.js';

// ── Estado del módulo ──
let _milestonesConfig = [];   // [{id, level, threshold, label, image_url}] — solo los configurados con imagen
let _userMilestones   = [];   // [{milestone_id, level, threshold, label, image_url, unlocked_at, notified_at}]
let _totalEmployees   = 0;    // Total de laminitas del álbum (para calcular %)
let _initialized      = false;

// Cola de modales a mostrar (por si el usuario alcanza varios hitos de golpe)
let _modalQueue = [];
let _modalShowing = false;

// ══════════════════════════════════════════════════════════════
//   CARGA INICIAL
// ══════════════════════════════════════════════════════════════

/**
 * Inicializa el módulo de hitos.
 * @param {Object} profile  — Perfil del usuario (con company_id)
 * @param {number} total    — Total de empleados activos del álbum
 */
export async function initMilestones(profile, total) {
  _totalEmployees = total;

  const [configRes, userRes] = await Promise.all([
    supabase.rpc('fn_get_milestones_config', { p_company_id: profile.company_id }),
    supabase.rpc('fn_get_user_milestones',   { p_company_id: profile.company_id })
  ]);

  _milestonesConfig = configRes.data || [];
  _userMilestones   = userRes.data   || [];
  _initialized      = true;
}

/**
 * Devuelve true si el Editor activó al menos un hito con imagen.
 */
export function isMilestonesEnabled() {
  return _milestonesConfig.length > 0;
}

// ══════════════════════════════════════════════════════════════
//   DETECCIÓN DE NUEVOS LOGROS
// ══════════════════════════════════════════════════════════════

/**
 * Revisa el progreso actual y desbloquea hitos si aplica.
 * Llamar después de cualquier acción que actualice collectedIds.
 * @param {Set} collectedIds — IDs de laminitas que tiene el usuario
 */
export async function checkMilestones(collectedIds) {
  if (!_initialized || _milestonesConfig.length === 0 || _totalEmployees === 0) return;

  const pct = Math.floor((collectedIds.size / _totalEmployees) * 100);

  for (const milestone of _milestonesConfig) {
    // ¿Ya lo tenía desbloqueado?
    const alreadyUnlocked = _userMilestones.some(
      um => um.milestone_id === milestone.id && um.unlocked_at !== null
    );
    if (alreadyUnlocked) continue;

    // ¿Alcanzó el umbral?
    if (pct >= milestone.threshold) {
      const { data } = await supabase.rpc('fn_unlock_milestone', {
        p_milestone_id: milestone.id
      });

      // Actualizar estado local
      const existing = _userMilestones.find(um => um.milestone_id === milestone.id);
      if (existing) {
        existing.unlocked_at = new Date().toISOString();
      } else {
        _userMilestones.push({
          ...milestone,
          milestone_id: milestone.id,
          unlocked_at: new Date().toISOString(),
          notified_at: null
        });
      }

      // Si fue nuevo, encolar modal
      if (data?.is_new) {
        _modalQueue.push(milestone);
      }
    }
  }

  // Mostrar modales en cola
  if (_modalQueue.length > 0 && !_modalShowing) {
    showNextMilestoneModal();
  }
}

// ══════════════════════════════════════════════════════════════
//   MODAL ÉPICO DE HITO DESBLOQUEADO
// ══════════════════════════════════════════════════════════════

function showNextMilestoneModal() {
  if (_modalQueue.length === 0) {
    _modalShowing = false;
    return;
  }

  _modalShowing = true;
  const milestone = _modalQueue.shift();
  showMilestoneModal(milestone);
}

function showMilestoneModal(milestone) {
  // Remover si ya existe
  document.getElementById('milestone-unlock-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'milestone-unlock-overlay';
  overlay.className = 'milestone-unlock-overlay';

  overlay.innerHTML = `
    <div class="milestone-unlock-card">
      <div class="milestone-confetti" aria-hidden="true">
        ${buildConfettiHTML()}
      </div>
      <div class="milestone-unlock-glow" aria-hidden="true"></div>
      <div class="milestone-unlock-badge-wrap">
        <img
          src="${milestone.image_url}"
          alt="${milestone.label}"
          class="milestone-unlock-badge"
          loading="eager"
        >
      </div>
      <div class="milestone-unlock-content">
        <p class="milestone-unlock-eyebrow">🏅 ¡Nuevo Hito Desbloqueado!</p>
        <h2 class="milestone-unlock-title">${milestone.label}</h2>
        <p class="milestone-unlock-subtitle">
          Alcanzaste el ${milestone.threshold}% del álbum.<br>
          ¡Sigue coleccionando!
        </p>
        <button class="milestone-unlock-btn" id="btn-close-milestone-modal">
          ¡Genial! 🎉
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Forzar reflow para que la animación funcione
  requestAnimationFrame(() => {
    overlay.classList.add('milestone-unlock-overlay--visible');
  });

  const close = async () => {
    overlay.classList.remove('milestone-unlock-overlay--visible');
    setTimeout(() => overlay.remove(), 400);

    // Marcar como notificado en DB
    await supabase.rpc('fn_mark_milestone_notified', {
      p_milestone_id: milestone.id
    });

    // Actualizar estado local
    const um = _userMilestones.find(m => m.milestone_id === milestone.id);
    if (um) um.notified_at = new Date().toISOString();

    _modalShowing = false;
    // Mostrar el siguiente si hay cola
    setTimeout(showNextMilestoneModal, 200);
  };

  document.getElementById('btn-close-milestone-modal')
    ?.addEventListener('click', close, { once: true });
}

function buildConfettiHTML() {
  const colors = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#3b82f6', '#f97316'];
  let html = '';
  for (let i = 0; i < 24; i++) {
    const color = colors[i % colors.length];
    const delay = (Math.random() * 1.2).toFixed(2);
    const x = (Math.random() * 100).toFixed(1);
    const rot = Math.floor(Math.random() * 360);
    html += `<span class="confetti-piece" style="
      left:${x}%;
      animation-delay:${delay}s;
      background:${color};
      transform:rotate(${rot}deg);
    "></span>`;
  }
  return html;
}

// ══════════════════════════════════════════════════════════════
//   PASE DE BATALLA (UI dentro del Modal de Ranking)
// ══════════════════════════════════════════════════════════════

/**
 * Renderiza el Pase de Batalla en el contenedor indicado.
 * @param {HTMLElement} container  — El div donde renderizar
 * @param {Set}         collectedIds — IDs actuales del usuario
 */
export function renderBattlePass(container, collectedIds) {
  if (!container) return;

  if (!_initialized || _milestonesConfig.length === 0) {
    container.innerHTML = `
      <p class="battlepass-empty">
        El editor aún no ha configurado los hitos del álbum.
      </p>`;
    return;
  }

  const pct = _totalEmployees > 0
    ? Math.floor((collectedIds.size / _totalEmployees) * 100)
    : 0;

  // Hallar el índice del primer hito no desbloqueado
  const nextMilestone = _milestonesConfig.find(
    m => !_userMilestones.some(um => um.milestone_id === m.id && um.unlocked_at)
  );

  container.innerHTML = `
    <div class="battlepass-progress-header">
      <span class="battlepass-progress-label">Tu progreso actual</span>
      <span class="battlepass-progress-pct">${pct}%</span>
    </div>
    <div class="battlepass-progress-bar-wrap">
      <div class="battlepass-progress-bar-fill" style="width:${pct}%"></div>
    </div>
    <p class="battlepass-progress-sub">
      ${collectedIds.size} de ${_totalEmployees} laminitas
    </p>

    <div class="battlepass-track">
      ${buildBattlePassTrack(pct, nextMilestone)}
    </div>
  `;
}

function buildBattlePassTrack(pct, nextMilestone) {
  return _milestonesConfig.map((m, idx) => {
    const isUnlocked = _userMilestones.some(
      um => um.milestone_id === m.id && um.unlocked_at !== null
    );
    const isNext = nextMilestone && m.id === nextMilestone.id;
    const isLocked = !isUnlocked && !isNext;

    // Línea de riel entre hitos
    const railPct = _milestonesConfig.length > 1 && idx < _milestonesConfig.length - 1
      ? buildRailSegment(idx, pct)
      : '';

    let statusClass = isUnlocked ? 'battlepass-item--unlocked'
                    : isNext     ? 'battlepass-item--next'
                    :              'battlepass-item--locked';

    let statusBadge = isUnlocked
      ? `<span class="battlepass-status battlepass-status--unlocked">✅ Desbloqueado</span>`
      : isNext
        ? `<span class="battlepass-status battlepass-status--next">
             ⬆ Próximo — faltan ${Math.max(0, m.threshold - pct)}%
           </span>`
        : `<span class="battlepass-status battlepass-status--locked">🔒 Bloqueado</span>`;

    return `
      <div class="battlepass-item ${statusClass}">
        <div class="battlepass-item-badge-wrap">
          <img
            src="${m.image_url}"
            alt="${m.label}"
            class="battlepass-item-badge ${isLocked ? 'battlepass-item-badge--locked' : ''}"
            loading="lazy"
          >
          ${isUnlocked ? '<div class="battlepass-item-check">✓</div>' : ''}
          ${isNext ? '<div class="battlepass-item-pulse"></div>' : ''}
        </div>
        <div class="battlepass-item-info">
          <span class="battlepass-item-label">${m.label}</span>
          <span class="battlepass-item-threshold">${m.threshold}% del álbum</span>
          ${statusBadge}
        </div>
      </div>
      ${railPct}
    `;
  }).join('');
}

function buildRailSegment(idx, currentPct) {
  const from = _milestonesConfig[idx].threshold;
  const to   = _milestonesConfig[idx + 1].threshold;

  // Cuánto del riel está "lleno"
  const filled = currentPct >= to ? 100
               : currentPct <= from ? 0
               : Math.round(((currentPct - from) / (to - from)) * 100);

  return `
    <div class="battlepass-rail">
      <div class="battlepass-rail-fill" style="height:${filled}%"></div>
    </div>
  `;
}

/**
 * Refresca los datos del módulo desde la DB.
 * Útil para sincronizar tras abrir el modal de ranking.
 */
export async function refreshUserMilestones(companyId) {
  const { data } = await supabase.rpc('fn_get_user_milestones', {
    p_company_id: companyId
  });
  if (data) _userMilestones = data;
}
