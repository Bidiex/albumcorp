/**
 * exchange.js — Modal de intercambio de stickers
 * Importar desde album.js: import { renderExchangeModal } from './exchange.js';
 */
import { supabase } from '../core/supabase.js';
import { renderSticker } from './stickers.js';
import { showPackReveal } from './pack.js';

let _profile = null;
let _employees = null;
let _collectedIds = null;
let _currentTab = 'market';
let _realtimeChannel = null;
let _pendingBadgeCount = 0;
let _exchangeBtn = null;

export function renderExchangeModal(profile, employees, collectedIds) {
  _profile = profile;
  _employees = employees;
  _collectedIds = collectedIds;

  // ── Botón flotante ──
  _exchangeBtn = document.createElement('button');
  _exchangeBtn.id = 'btn-exchange';
  _exchangeBtn.className = 'exchange-btn';
  _exchangeBtn.innerHTML = '🔀 Intercambiar';

  let bottomActions = document.getElementById('bottom-actions');
  if (bottomActions) {
    bottomActions.insertBefore(_exchangeBtn, bottomActions.firstChild);
  } else {
    document.body.appendChild(_exchangeBtn);
  }

  // ── Backdrop + Modal ──
  const backdrop = document.createElement('div');
  backdrop.className = 'exchange-modal-backdrop';
  backdrop.id = 'exchange-backdrop';

  backdrop.innerHTML = `
    <div class="exchange-modal" id="exchange-modal">
      <div class="exchange-modal__header">
        <h3 class="exchange-modal__title">🔀 Centro de Intercambio</h3>
        <button class="exchange-modal__close" id="btn-close-exchange">✕</button>
      </div>
      <div class="exchange-tabs">
        <button class="exchange-tab active" data-tab="market">🌐 Market</button>
        <button class="exchange-tab" data-tab="create">➕ Crear oferta</button>
        <button class="exchange-tab" data-tab="mine">📋 Mis ofertas</button>
      </div>
      <div class="exchange-modal__body" id="exchange-body"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  // ── Eventos ──
  _exchangeBtn.addEventListener('click', openModal);
  document.getElementById('btn-close-exchange').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  backdrop.querySelectorAll('.exchange-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      backdrop.querySelectorAll('.exchange-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _currentTab = tab.dataset.tab;
      renderTab(_currentTab);
    });
  });

  // ── Realtime ──
  subscribeToTrades();
}

function openModal() {
  document.getElementById('exchange-backdrop').classList.add('open');
  _pendingBadgeCount = 0;
  updateBadge();
  renderTab(_currentTab);
}

function closeModal() {
  document.getElementById('exchange-backdrop').classList.remove('open');
}

function updateBadge() {
  const existing = _exchangeBtn.querySelector('.exchange-btn__badge');
  if (existing) existing.remove();
  if (_pendingBadgeCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'exchange-btn__badge';
    badge.textContent = _pendingBadgeCount;
    _exchangeBtn.appendChild(badge);
  }
}

// ── Tabs ──
async function renderTab(tab) {
  const body = document.getElementById('exchange-body');
  body.innerHTML = '<p class="offer-empty">Cargando...</p>';
  if (tab === 'market') await renderMarket(body);
  else if (tab === 'create') await renderCreateForm(body);
  else if (tab === 'mine') await renderMyOffers(body);
}

// ── Market ──
async function renderMarket(body) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  const { data: offers, error } = await supabase
    .from('trade_offers')
    .select('*')
    .eq('company_id', _profile.company_id)
    .eq('status', 'open')
    .neq('from_user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !offers || offers.length === 0) {
    body.innerHTML = '<p class="offer-empty">No hay intercambios disponibles aún.<br>¡Sé el primero en publicar uno!</p>';
    return;
  }

  const creatorIds = [...new Set(offers.map(o => o.from_user_id))];
  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, display_name')
      .in('id', creatorIds);
    const profileMap = {};
    if (profiles) profiles.forEach(p => profileMap[p.id] = p.display_name);
    offers.forEach(o => { o.creator_profile = { display_name: profileMap[o.from_user_id] }; });
  }

  // Obtener mis duplicados para saber si puedo aceptar
  const { data: myDups } = await supabase
    .from('user_duplicates')
    .select('employee_id, quantity')
    .eq('user_id', userId)
    .gt('quantity', 0);

  const myDupMap = {};
  (myDups || []).forEach(d => { myDupMap[d.employee_id] = d.quantity; });

  body.innerHTML = '';
  offers.forEach(offer => {
    const card = buildOfferCard(offer, myDupMap, userId);
    body.appendChild(card);
  });
}

function buildOfferCard(offer, myDupMap, userId) {
  const creatorName = offer.creator_profile?.display_name || 'Usuario';
  const offering = offer.offering || [];
  const requesting = offer.requesting || [];

  const canAccept = requesting.every(r =>
    (myDupMap[r.employee_id] || 0) >= (r.quantity || 1)
  );

  const card = document.createElement('div');
  card.className = 'offer-card';

  const offeringHtml = offering.map(r => {
    const emp = _employees.find(e => e.id === r.employee_id);
    return `<span class="offer-chip">${emp?.name || '?'} <span class="offer-chip__qty">×${r.quantity || 1}</span></span>`;
  }).join('');

  const requestingHtml = requesting.map(r => {
    const emp = _employees.find(e => e.id === r.employee_id);
    return `<span class="offer-chip">${emp?.name || '?'} <span class="offer-chip__qty">×${r.quantity || 1}</span></span>`;
  }).join('');

  card.innerHTML = `
    <div class="offer-card__user">${creatorName}</div>
    <div class="offer-card__stickers">${offeringHtml}</div>
    <div class="offer-card__arrow">⇄</div>
    <div class="offer-card__stickers">${requestingHtml}</div>
    <button class="offer-accept-btn" data-offer-id="${offer.id}" ${canAccept ? '' : 'disabled'}>
      ${canAccept ? 'Aceptar' : 'No tienes'}
    </button>
  `;

  card.querySelector('.offer-accept-btn')?.addEventListener('click', () => acceptOffer(offer.id));
  return card;
}

async function acceptOffer(offerId) {
  const btn = document.querySelector(`[data-offer-id="${offerId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

  const { data, error } = await supabase.rpc('fn_accept_trade', { p_trade_id: offerId });

  if (error) {
    showExchangeToast(`Error: ${error.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Aceptar'; }
    return;
  }

  closeModal();

  const received = data?.received || [];
  if (received.length > 0) {
    showPackReveal(received, (stickers) => {
      window.__refreshDuplicates?.();
    });
  } else {
    showExchangeToast('¡Intercambio realizado!');
    window.__refreshDuplicates?.();
  }
}

// ── Mis ofertas ──
async function renderMyOffers(body) {
  const userId = (await supabase.auth.getUser()).data.user.id;
  const { data: offers } = await supabase
    .from('trade_offers')
    .select('*')
    .eq('from_user_id', userId)
    .in('status', ['open', 'accepted'])
    .order('created_at', { ascending: false });

  if (!offers || offers.length === 0) {
    body.innerHTML = '<p class="offer-empty">No tienes ofertas activas.</p>';
    return;
  }

  body.innerHTML = '';
  offers.forEach(offer => {
    const div = document.createElement('div');
    div.className = `offer-card ${offer.status === 'accepted' ? 'offer-card--accepted' : ''}`;

    const offering = (offer.offering || []).map(r => {
      const emp = _employees.find(e => e.id === r.employee_id);
      return `<span class="offer-chip">${emp?.name || '?'} <span class="offer-chip__qty">×${r.quantity || 1}</span></span>`;
    }).join('');

    const requesting = (offer.requesting || []).map(r => {
      const emp = _employees.find(e => e.id === r.employee_id);
      return `<span class="offer-chip">${emp?.name || '?'} <span class="offer-chip__qty">×${r.quantity || 1}</span></span>`;
    }).join('');

    const statusBadge = offer.status === 'accepted'
      ? '<span class="offer-status offer-status--accepted">✓ Aceptada</span>'
      : '<span class="offer-status offer-status--open">Abierta</span>';

    div.innerHTML = `
      <div class="offer-card__stickers">${offering}</div>
      <div class="offer-card__arrow">⇄</div>
      <div class="offer-card__stickers">${requesting}</div>
      ${statusBadge}
      ${offer.status === 'open'
        ? `<button class="offer-cancel-btn" data-offer-id="${offer.id}">Cancelar</button>`
        : ''}
    `;

    div.querySelector('.offer-cancel-btn')?.addEventListener('click', () => cancelOffer(offer.id, div));
    body.appendChild(div);
  });
}

async function cancelOffer(offerId, cardEl) {
  const { error } = await supabase
    .from('trade_offers')
    .update({ status: 'cancelled' })
    .eq('id', offerId);

  if (!error) cardEl.remove();
  else showExchangeToast('Error al cancelar: ' + error.message);
}

// ── Crear oferta ──
async function renderCreateForm(body) {
  const userId = (await supabase.auth.getUser()).data.user.id;

  const { data: myDups } = await supabase
    .from('user_duplicates')
    .select('employee_id, quantity, employees(id, name, role, photo_url, rarity)')
    .eq('user_id', userId)
    .gt('quantity', 0);

  if (!myDups || myDups.length === 0) {
    body.innerHTML = '<p class="offer-empty">Necesitas stickers repetidos para intercambiar.</p>';
    return;
  }

  // Estado de selección
  const offeringSelected = {}; // employee_id → quantity
  const requestingSelected = {}; // employee_id → quantity

  body.innerHTML = `
    <div class="create-offer">
      <div class="create-offer__section">
        <label class="create-offer__label">📦 Ofrezco (mis repetidos)</label>
        <div class="create-offer__grid" id="offering-grid"></div>
      </div>
      <div class="create-offer__section">
        <label class="create-offer__label">🎯 Pido (stickers que quiero)</label>
        <div class="create-offer__grid" id="requesting-grid"></div>
      </div>
      <button class="create-offer__submit" id="btn-publish-trade">Publicar oferta</button>
    </div>
  `;

  // Grid de ofrecidos (mis duplicados)
  const offeringGrid = body.querySelector('#offering-grid');
  myDups.forEach(({ employee_id, quantity, employees: emp }) => {
    if (!emp) return;
    const pick = document.createElement('div');
    pick.className = 'sticker-pick';
    pick.dataset.empId = employee_id;
    pick.innerHTML = `
      ${renderSticker(emp, true)}
      <div class="sticker-pick__name">${emp.name}</div>
      <div class="sticker-pick__qty">Tengo: ×${quantity}</div>
      <div class="sticker-pick__counter" style="display:none">
        <button class="qty-btn" data-dir="-1">−</button>
        <span class="qty-val">1</span>
        <button class="qty-btn" data-dir="1">+</button>
      </div>
    `;
    pick.addEventListener('click', (e) => {
      if (e.target.classList.contains('qty-btn')) return;
      const isSelected = pick.classList.toggle('selected');
      const counter = pick.querySelector('.sticker-pick__counter');
      counter.style.display = isSelected ? 'flex' : 'none';
      if (isSelected) offeringSelected[employee_id] = 1;
      else delete offeringSelected[employee_id];
    });
    pick.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = parseInt(btn.dataset.dir);
        const cur = offeringSelected[employee_id] || 1;
        const next = Math.max(1, Math.min(quantity, cur + dir));
        offeringSelected[employee_id] = next;
        pick.querySelector('.qty-val').textContent = next;
      });
    });
    offeringGrid.appendChild(pick);
  });

  // Grid de pedidos (todos los empleados de la empresa)
  const requestingGrid = body.querySelector('#requesting-grid');
  _employees.forEach(emp => {
    const pick = document.createElement('div');
    pick.className = 'sticker-pick';
    pick.dataset.empId = emp.id;
    pick.innerHTML = `
      ${renderSticker(emp, _collectedIds.has(emp.id))}
      <div class="sticker-pick__name">${emp.name}</div>
      <div class="sticker-pick__counter" style="display:none">
        <button class="qty-btn" data-dir="-1">−</button>
        <span class="qty-val">1</span>
        <button class="qty-btn" data-dir="1">+</button>
      </div>
    `;
    pick.addEventListener('click', (e) => {
      if (e.target.classList.contains('qty-btn')) return;
      const isSelected = pick.classList.toggle('selected');
      const counter = pick.querySelector('.sticker-pick__counter');
      counter.style.display = isSelected ? 'flex' : 'none';
      if (isSelected) requestingSelected[emp.id] = 1;
      else delete requestingSelected[emp.id];
    });
    pick.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = parseInt(btn.dataset.dir);
        const cur = requestingSelected[emp.id] || 1;
        requestingSelected[emp.id] = Math.max(1, cur + dir);
        pick.querySelector('.qty-val').textContent = requestingSelected[emp.id];
      });
    });
    requestingGrid.appendChild(pick);
  });

  // Publicar
  body.querySelector('#btn-publish-trade').addEventListener('click', async () => {
    const offering = Object.entries(offeringSelected).map(([employee_id, quantity]) => ({ employee_id, quantity }));
    const requesting = Object.entries(requestingSelected).map(([employee_id, quantity]) => ({ employee_id, quantity }));

    if (offering.length === 0 || requesting.length === 0) {
      showExchangeToast('Selecciona al menos un sticker en cada lado.');
      return;
    }

    const publishBtn = body.querySelector('#btn-publish-trade');
    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicando...';

    const { data, error } = await supabase.rpc('fn_create_trade', {
      p_offering: offering,
      p_requesting: requesting
    });

    if (error) {
      showExchangeToast('Error: ' + error.message);
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publicar oferta';
      return;
    }

    showExchangeToast('¡Oferta publicada!');
    // Cambiar a "Mis ofertas"
    document.querySelector('[data-tab="mine"]').click();
  });
}

// ── Realtime ──
function subscribeToTrades() {
  if (_realtimeChannel) supabase.removeChannel(_realtimeChannel);

  _realtimeChannel = supabase
    .channel(`trades-${_profile.company_id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'trade_offers',
      filter: `company_id=eq.${_profile.company_id}`
    }, async (payload) => {
      const row = payload.new;
      const userId = (await supabase.auth.getUser()).data.user.id;

      // Si mi oferta fue aceptada
      if (row && row.from_user_id === userId && row.status === 'accepted') {
        _pendingBadgeCount++;
        updateBadge();
        showExchangeToast('🎉 ¡Tu intercambio fue aceptado! Revisa tus repetidos.');
        window.__refreshDuplicates?.();
      }

      // Refrescar market si está abierto
      const backdrop = document.getElementById('exchange-backdrop');
      if (backdrop?.classList.contains('open') && _currentTab === 'market') {
        const body = document.getElementById('exchange-body');
        renderMarket(body);
      }
    })
    .subscribe();
}

// ── Toast ──
function showExchangeToast(msg) {
  const existing = document.querySelector('.exchange-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'exchange-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('exchange-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('exchange-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
