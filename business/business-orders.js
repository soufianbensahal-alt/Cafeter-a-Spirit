import {
  addPilotMember,
  getCurrentOrderCode,
  getOrderingSettings,
  listBusinessOrders,
  listBusinessProducts,
  listPilotMembers,
  regenerateOrderCode,
  removePilotMember,
  setOrderingEnabled,
  setOrderingPilotOnly,
  setProductAvailability,
  subscribeToBusinessOrders,
  updateBusinessOrderStatus
} from '../services/business-order-service.js';
import { createRealtimeWithFallback } from '../services/order-monitor.js';
import {
  createOrderAlertTracker,
  groupBusinessOrders,
  newlyCancelled,
  normalizeRejectionReason,
  pendingTitle,
  REJECTION_REASON_MAX
} from '../services/order-alert-rules.js';
import { createOrderAlertDevice } from '../services/order-alert-device.js';
import { accessibleDialogMarkup, createAccessibleModalController } from '../services/accessible-modal.js';
import { displayText } from '../services/display-text.js';
import { PICKUP_TABLE_LABEL } from '../services/cart-rules.js';
import {
  PRINTER_ICON,
  renderKitchenTicket,
  renderOrderTicket,
  renderOrderTicketBody,
  ticketTranslator
} from './order-ticket.js';

// El panel está en castellano; ORDER_TICKET_COPY ya incluye el catalán.
const TICKET_LANG = 'es';
const ticketText = ticketTranslator(TICKET_LANG);

// Panel de pedidos del equipo. Pinta en contenedores que business-view deja en
// la pantalla principal ([data-orders-status], [data-orders-panel],
// [data-control-panel], [data-orders-tab-count]) y los actualiza sin repintar
// el resto de la app, para no perder lo que se esté escribiendo.

const REMINDER_TICK_MS = 5000;
const FRESH_HIGHLIGHT_MS = 30000;
const MANAGER_ROLES = new Set(['owner', 'manager']);
const QUICK_REASONS = Object.freeze(['Producto agotado', 'Cocina cerrada', 'Mucha espera ahora mismo']);

const escapeHTML = (value = '') => displayText(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const money = (cents) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);
const clock = (timestamp) => timestamp ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)) : '';
const placeLabel = (label) => {
  const clean = String(label || '').trim();
  if (!clean || clean === PICKUP_TABLE_LABEL) return 'Barra';
  return /^mesa\b/i.test(clean) ? clean : `Mesa ${clean}`;
};
const elapsedLabel = (timestamp, now = Date.now()) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000));
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};
const categoryLabel = (id) => {
  const text = String(id || '').replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const ORDER_ERRORS = {
  invalid_transition: (number) => `El pedido nº ${number} ya no admite ese cambio. Puede que el cliente lo haya cancelado.`,
  not_authorized: () => 'Tu sesión no puede gestionar pedidos. Vuelve a iniciar sesión con verificación en dos pasos.',
  not_found: (number) => `No se ha encontrado el pedido nº ${number}.`,
  reason_required: () => 'Indica un motivo breve para rechazar.',
  network_error: () => 'Sin conexión. El cambio no se ha guardado.'
};
const orderErrorText = (code, number) => (ORDER_ERRORS[code] || (() => 'No se ha podido actualizar el pedido. Inténtalo de nuevo.'))(number);

export function createBusinessOrdersPanel({
  employee,
  announcer,
  appRoot,
  modalRoot,
  baseTitle = 'SPIRIT · Modo cafetería',
  onSessionLost = () => {}
}) {
  const businessId = employee.businessId;
  const canManagePilot = MANAGER_ROLES.has(employee.role);
  const state = {
    orders: [],
    byId: new Map(),
    loaded: false,
    loadError: '',
    connection: 'connecting',
    lastSyncAt: null,
    alerts: null,
    busy: new Set(),
    freshIds: new Set(),
    message: null,
    control: {
      loaded: false,
      loading: false,
      error: '',
      settings: null,
      code: null,
      products: [],
      productFilter: '',
      pilot: [],
      pilotEmail: '',
      pilotMessage: '',
      busy: new Set()
    }
  };

  const tracker = createOrderAlertTracker();
  const device = createOrderAlertDevice({
    onChange: (status) => {
      state.alerts = status;
      paintStatus();
    }
  });
  state.alerts = device.status();

  let modalOrderId = null;
  // Ticket abierto (independiente de modalOrderId, que es el del rechazo y se
  // cierra solo si el pedido deja de estar pendiente).
  let ticketOrderId = null;
  const modal = createAccessibleModalController({
    appRoot,
    modalRoot,
    onClose: ({ reason }) => {
      modalOrderId = null;
      const closedTicket = ticketOrderId;
      ticketOrderId = null;
      // Si la tarjeta se repintó con el ticket abierto, el botón que lo abrió
      // ya no está en el DOM: se devuelve el foco a su sustituto.
      if (closedTicket && reason !== 'replace') {
        setTimeout(() => {
          const active = document.activeElement;
          if (active && active !== document.body && !active.matches('h1, main')) return;
          appRoot.querySelector(`[data-focus-key="ticket-${CSS.escape(closedTicket)}"]`)?.focus();
        }, 0);
      }
    }
  });

  let messageTimer = 0;
  const showMessage = (text, tone = 'info') => {
    state.message = text ? { text, tone } : null;
    clearTimeout(messageTimer);
    if (text && tone !== 'error') messageTimer = setTimeout(() => { state.message = null; paintOrders(); }, 12000);
    paintOrders();
  };

  // ---------------------------------------------------------------------------
  // Sincronización.
  // ---------------------------------------------------------------------------
  const reconcile = async ({ reasons } = {}) => {
    try {
      const orders = await listBusinessOrders(businessId);
      const previousById = state.byId;
      const result = tracker.reconcile(orders, { reasons });
      // Sustitución completa: nunca se añaden filas sueltas desde el payload,
      // así que un evento repetido o tardío no duplica tarjetas.
      state.orders = [...orders];
      state.byId = new Map(orders.map((order) => [order.id, order]));
      state.loaded = true;
      state.loadError = '';
      state.lastSyncAt = Date.now();

      if (result.fresh.length) {
        result.fresh.forEach((id) => {
          state.freshIds.add(id);
          setTimeout(() => { state.freshIds.delete(id); paintOrders(); }, FRESH_HIGHLIGHT_MS);
        });
        device.alert('new');
        const labels = result.fresh.map((id) => {
          const order = state.byId.get(id);
          return `nº ${order.number} · ${placeLabel(order.tableLabel)}`;
        });
        announcer?.announce(`Nuevo pedido ${labels.join(', ')}`, { assertive: true });
      }

      const cancelled = newlyCancelled(previousById, orders);
      if (cancelled.length) {
        const numbers = cancelled.map((order) => `nº ${order.number}`).join(', ');
        showMessage(`El cliente ha cancelado el pedido ${numbers}.`, 'warning');
        announcer?.announce(`Pedido ${numbers} cancelado por el cliente`, { assertive: true });
      }

      if (modalOrderId && state.byId.get(modalOrderId)?.status !== 'pending') {
        const order = state.byId.get(modalOrderId);
        modal.close({ force: true, restoreFocus: false, reason: 'order-changed' });
        if (order && order.status !== 'cancelled') showMessage(`El pedido nº ${order.number} ya se ha gestionado.`, 'info');
      }
    } catch (error) {
      state.loadError = error?.code === 'network_error'
        ? 'Sin conexión. Se reintentará automáticamente.'
        : 'No se han podido actualizar los pedidos. Se reintentará automáticamente.';
      if (error?.code === 'not_authorized' || error?.code === 'not_authenticated') onSessionLost(error);
      throw error;
    } finally {
      paintOrders();
      paintStatus();
      paintTabCount();
    }
  };

  const monitor = createRealtimeWithFallback({
    reconcile,
    subscribe: ({ onChange, onStatus }) => subscribeToBusinessOrders(businessId, {
      onChange,
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') state.connection = 'live';
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) && monitor.isRunning()) state.connection = navigator.onLine === false ? 'offline' : 'reconnecting';
        onStatus(status);
        paintStatus();
      }
    })
  });

  let reminderTimer = 0;
  const tick = () => {
    const due = tracker.dueReminders();
    if (due.length) {
      device.alert('reminder');
      const numbers = due.map((id) => `nº ${state.byId.get(id)?.number ?? ''}`).join(', ');
      announcer?.announce(`Pedido ${numbers} sigue sin atender`, { assertive: true });
    }
    document.querySelectorAll('[data-elapsed]').forEach((element) => {
      element.textContent = elapsedLabel(element.dataset.elapsed);
    });
    paintStatus();
  };

  const handleOffline = () => { state.connection = 'offline'; paintStatus(); };
  const handleOnline = () => { if (state.connection === 'offline') state.connection = 'reconnecting'; paintStatus(); };

  const start = () => {
    tracker.reset();
    monitor.start();
    monitor.refresh('initial');
    clearInterval(reminderTimer);
    reminderTimer = setInterval(tick, REMINDER_TICK_MS);
    addEventListener('offline', handleOffline);
    addEventListener('online', handleOnline);
  };

  const stop = () => {
    monitor.stop();
    clearInterval(reminderTimer);
    reminderTimer = 0;
    clearTimeout(messageTimer);
    removeEventListener('offline', handleOffline);
    removeEventListener('online', handleOnline);
    modal.close({ force: true, restoreFocus: false, reason: 'stop' });
    device.destroy();
    document.title = baseTitle;
  };

  // ---------------------------------------------------------------------------
  // Pintado.
  // ---------------------------------------------------------------------------
  const pendingCount = () => state.orders.filter((order) => order.status === 'pending').length;

  // Repinta un contenedor conservando el foco por data-focus-key.
  const paintInto = (selector, html) => {
    const container = document.querySelector(selector);
    if (!container) return null;
    const active = document.activeElement;
    const focusKey = container.contains(active) ? active?.dataset?.focusKey : '';
    const selection = focusKey && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    container.innerHTML = html;
    if (focusKey) {
      const target = container.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
      if (target) {
        target.focus({ preventScroll: true });
        if (selection) { try { target.setSelectionRange(...selection); } catch { /* sin selección */ } }
      }
    }
    return container;
  };

  const paintTabCount = () => {
    const count = pendingCount();
    document.title = pendingTitle(baseTitle, count);
    document.querySelectorAll('[data-orders-tab-count]').forEach((element) => {
      element.textContent = count ? String(count) : '';
      element.hidden = !count;
    });
  };

  const alertsChip = () => {
    const alerts = state.alerts;
    if (alerts.ready) return ['ok', 'Avisos activos'];
    if (alerts.soundReady) return ['warn', 'Avisos activos · la pantalla puede apagarse'];
    if (alerts.audio === 'unsupported') return ['bad', 'Sonido no disponible en este navegador'];
    return ['bad', alerts.activated ? 'Avisos en pausa' : 'Avisos desactivados'];
  };
  const screenChip = () => {
    const wakeLock = state.alerts.wakeLock;
    if (wakeLock === 'active') return ['ok', 'Pantalla siempre encendida'];
    if (wakeLock === 'unsupported') return ['warn', 'Bloqueo de pantalla no compatible'];
    if (wakeLock === 'off') return ['muted', 'Pantalla sin bloquear'];
    return ['warn', 'La pantalla puede apagarse'];
  };
  const connectionChip = () => {
    if (state.connection === 'offline') return ['bad', 'Sin conexión'];
    if (monitor.isPolling()) return ['warn', 'Sin tiempo real · consultando cada 5 s'];
    if (state.connection === 'live') return ['ok', 'En directo'];
    if (state.connection === 'reconnecting') return ['warn', 'Reconectando…'];
    return ['muted', 'Conectando…'];
  };
  const chip = ([tone, text], key) => `<span class="orders-chip orders-chip--${tone}" data-${key}-indicator data-state="${tone}"><i aria-hidden="true"></i>${escapeHTML(text)}</span>`;

  const statusHTML = () => {
    const alerts = state.alerts;
    const activation = alerts.needsActivation
      ? `<div class="orders-activate ${alerts.lost ? 'orders-activate--lost' : ''}"><div><strong>${alerts.lost ? 'El sonido se ha pausado.' : 'Empieza el turno activando los avisos.'}</strong><small>${alerts.lost ? 'El navegador ha detenido el audio. Pulsa para reactivarlo.' : 'Necesario para que suene cada pedido nuevo y la pantalla no se apague.'}</small></div><button class="business-primary" type="button" data-orders-action="activate-alerts" data-focus-key="activate-alerts">Activar avisos</button></div>`
      : '';
    return `<div class="orders-chips" aria-label="Estado de avisos y conexión">${chip(alertsChip(), 'alerts')}${chip(screenChip(), 'screen')}${chip(connectionChip(), 'connection')}</div>${activation}`;
  };

  const paintStatus = () => {
    paintInto('[data-orders-status]', statusHTML());
  };

  const itemsHTML = (order) => `<ul class="order-ticket__items">${order.items.map((item) => `<li><b>${item.quantity}×</b><span>${escapeHTML(item.productName)}</span><small>${money(item.lineTotalCents)}</small></li>`).join('')}</ul>`;

  const actionsHTML = (order) => {
    const busy = state.busy.has(order.id) ? 'disabled' : '';
    const button = (action, label, tone = 'primary') => `<button class="order-action order-action--${tone}" type="button" data-orders-action="${action}" data-order-id="${escapeHTML(order.id)}" data-focus-key="${action}-${escapeHTML(order.id)}" ${busy}>${label}</button>`;
    if (order.status === 'pending') return `<div class="order-ticket__actions">${button('reject', 'Rechazar', 'secondary')}${button('accept', 'Aceptar')}</div>`;
    if (order.status === 'accepted') return `<div class="order-ticket__actions">${button('preparing', 'En preparación')}</div>`;
    if (order.status === 'preparing') return `<div class="order-ticket__actions">${button('served', 'Servido')}</div>`;
    return '';
  };

  const statusLabel = { pending: 'Sin atender', accepted: 'Aceptado', preparing: 'En preparación', served: 'Servido', cancelled: 'Cancelado por el cliente', rejected: 'Rechazado' };

  // Comanda imprimible sólo mientras el pedido está en curso (Nuevos y En
  // preparación). Botón pequeño, arriba y lejos de las acciones de estado.
  const PRINTABLE_STATUSES = new Set(['pending', 'accepted', 'preparing']);
  const printToolHTML = (order) => (PRINTABLE_STATUSES.has(order.status)
    ? `<button class="order-tool" type="button" data-orders-action="print" data-order-id="${escapeHTML(order.id)}" data-focus-key="print-${escapeHTML(order.id)}" aria-label="${escapeHTML(ticketText('printOrder', { number: order.number }))}">${PRINTER_ICON}</button>`
    : '');

  const ticketHTML = (order, { compact = false } = {}) => {
    const fresh = state.freshIds.has(order.id);
    const classes = ['order-ticket', `order-ticket--${order.status}`, fresh ? 'order-ticket--fresh' : '', compact ? 'order-ticket--compact' : ''].filter(Boolean).join(' ');
    const stamp = order.status === 'served' ? order.servedAt : order.status === 'cancelled' ? order.cancelledAt : order.status === 'rejected' ? order.rejectedAt : order.createdAt;
    // La cabecera (nº, mesa, hora) es el botón que abre el ticket.
    return `<article class="${classes}" aria-label="Pedido nº ${order.number}" data-order-ticket="${escapeHTML(order.id)}" data-status="${order.status}">
      <header class="order-ticket__top"><button class="order-ticket__head" type="button" data-orders-action="ticket" data-order-id="${escapeHTML(order.id)}" data-focus-key="ticket-${escapeHTML(order.id)}" aria-label="${escapeHTML(ticketText('openTicket', { number: order.number }))}, ${escapeHTML(placeLabel(order.tableLabel))}, ${clock(order.createdAt)}"><strong class="order-ticket__number">Nº ${order.number}</strong><span class="order-ticket__place">${escapeHTML(placeLabel(order.tableLabel))}</span><time datetime="${escapeHTML(order.createdAt)}">${clock(order.createdAt)}</time></button>${printToolHTML(order)}</header>
      <p class="order-ticket__meta"><span>${escapeHTML(order.customer)}</span>${order.status === 'pending' ? ` · <span data-elapsed="${escapeHTML(order.createdAt)}">${elapsedLabel(order.createdAt)}</span>` : ''}</p>
      <span class="order-ticket__status" data-order-status>${fresh ? 'Nuevo · ' : ''}${statusLabel[order.status] || order.status}${stamp && order.status !== 'pending' ? ` · ${clock(stamp)}` : ''}</span>
      ${compact ? '' : itemsHTML(order)}
      ${order.note && !compact ? `<p class="order-ticket__note"><strong>Nota:</strong> ${escapeHTML(order.note)}</p>` : ''}
      ${order.rejectionReason ? `<p class="order-ticket__reason"><strong>Motivo:</strong> ${escapeHTML(order.rejectionReason)}</p>` : ''}
      <footer class="order-ticket__foot"><strong>${money(order.totalCents)}</strong><span>Pago en el local</span></footer>
      ${actionsHTML(order)}
    </article>`;
  };

  // Los servidos van compactos: en hora punta la columna crece mucho.
  const columnHTML = (key, title, orders, empty, { compact = false } = {}) => `<section class="orders-column orders-column--${key}" aria-labelledby="orders-column-${key}"><h2 id="orders-column-${key}">${title} <span class="orders-count">${orders.length}</span></h2>${orders.length ? orders.map((order) => ticketHTML(order, { compact })).join('') : `<p class="business-empty">${empty}</p>`}</section>`;

  const ordersHTML = () => {
    const groups = groupBusinessOrders(state.orders);
    const message = state.message ? `<p class="orders-message orders-message--${state.message.tone}" role="${state.message.tone === 'error' ? 'alert' : 'status'}">${escapeHTML(state.message.text)}</p>` : '';
    const error = state.loadError ? `<p class="orders-message orders-message--error" role="alert">${escapeHTML(state.loadError)}</p>` : '';
    if (!state.loaded) return `<h1 class="orders-title">Pedidos</h1>${error}${message}<p class="business-empty"><span class="business-spinner" aria-hidden="true"></span> Cargando pedidos…</p>`;
    return `<h1 class="orders-title">Pedidos</h1>${error}${message}
      <div class="orders-board">
        ${columnHTML('new', 'Nuevos', groups.fresh, 'No hay pedidos nuevos.')}
        ${columnHTML('progress', 'En preparación', groups.inProgress, 'Nada en preparación.')}
        ${columnHTML('served', 'Servidos', groups.served.slice(0, 30), 'Aún no se ha servido ningún pedido hoy.', { compact: true })}
      </div>
      <section class="orders-closed" aria-labelledby="orders-closed-title"><h2 id="orders-closed-title">Cancelados y rechazados hoy <span class="orders-count">${groups.closed.length}</span></h2>${groups.closed.length ? `<div class="orders-closed__list">${groups.closed.map((order) => ticketHTML(order, { compact: true })).join('')}</div>` : '<p class="business-empty">Ninguno por ahora.</p>'}</section>`;
  };

  const paintOrders = () => {
    paintInto('[data-orders-panel]', ordersHTML());
    refreshOpenTicket();
  };

  // ---------------------------------------------------------------------------
  // Ticket digital y comanda.
  // ---------------------------------------------------------------------------
  const ticketOptions = () => ({ lang: TICKET_LANG, businessName: employee.businessName, escapeHTML });

  const openTicket = (orderId) => {
    const order = state.byId.get(orderId);
    if (!order) return;
    const dialog = modal.open(accessibleDialogMarkup({
      labelledBy: 'order-ticket-title',
      className: 'modal--form business-modal ticket-modal',
      content: renderOrderTicket(order, ticketOptions())
    }), { initialFocus: '[data-ticket-close]' });
    ticketOrderId = orderId;
    bindModal(dialog);
  };

  // Con el ticket abierto, un cambio por Realtime actualiza su contenido sin
  // mover el foco (Cerrar e Imprimir quedan fuera de la zona repintada).
  function refreshOpenTicket() {
    if (!ticketOrderId || !modal.isOpen()) return;
    const order = state.byId.get(ticketOrderId);
    const body = modal.currentDialog()?.querySelector('[data-ticket-body]');
    if (order && body) body.innerHTML = renderOrderTicketBody(order, ticketOptions());
  }

  let printCleanup = null;
  const printOrder = (orderId) => {
    const order = state.byId.get(orderId);
    if (!order) return;
    printCleanup?.();
    let root = document.getElementById('print-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      document.body.append(root);
    }
    root.innerHTML = renderKitchenTicket(order, ticketOptions());
    document.documentElement.classList.add('is-printing-ticket');
    const cleanup = () => {
      document.documentElement.classList.remove('is-printing-ticket');
      root.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
      printCleanup = null;
    };
    printCleanup = cleanup;
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  // ---------------------------------------------------------------------------
  // Panel de control.
  // ---------------------------------------------------------------------------
  const switchHTML = ({ key, label, checked, disabled = false }) => `<label class="business-switch"><input type="checkbox" role="switch" data-control-switch="${key}" data-focus-key="switch-${key}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="${escapeHTML(label)}"><span aria-hidden="true"></span></label>`;

  const controlHTML = () => {
    const control = state.control;
    if (!control.loaded) {
      return `<h1 class="orders-title">Panel de control</h1>${control.error ? `<p class="orders-message orders-message--error" role="alert">${escapeHTML(control.error)}</p><button class="business-secondary" type="button" data-orders-action="reload-control">Reintentar</button>` : '<p class="business-empty"><span class="business-spinner" aria-hidden="true"></span> Cargando…</p>'}`;
    }
    const settings = control.settings;
    const code = control.code;
    const filter = control.productFilter.trim().toLowerCase();
    const soldOut = control.products.filter((product) => !product.available);
    const visible = control.products.filter((product) => !filter || product.name.toLowerCase().includes(filter));
    const categories = [...new Set(visible.map((product) => product.categoryId))];
    const codeBlock = code?.status === 'ok'
      ? `<p class="control-code" data-order-code aria-label="Código del día: ${escapeHTML(code.code.split('').join(' '))}">${escapeHTML(code.code)}</p><p class="control-help">Válido hasta las ${clock(code.expiresAt)}. Los clientes lo introducen al confirmar el pedido.</p><button class="business-secondary" type="button" data-orders-action="regenerate-code" data-focus-key="regenerate-code" ${control.busy.has('code') ? 'disabled' : ''}>Regenerar código</button>`
      : `<p class="control-code control-code--empty">— — — —</p><p class="control-help">No hay código activo: nadie puede enviar pedidos hasta que generes uno.</p><button class="business-primary" type="button" data-orders-action="generate-code" data-focus-key="generate-code" ${control.busy.has('code') ? 'disabled' : ''}>Generar código</button>`;
    return `<h1 class="orders-title">Panel de control</h1>
      ${control.error ? `<p class="orders-message orders-message--error" role="alert">${escapeHTML(control.error)}</p>` : ''}
      <div class="control-grid">
        <section class="control-card" aria-labelledby="control-ordering-title">
          <h2 id="control-ordering-title">Pedidos desde la carta</h2>
          <div class="control-row"><div><strong data-ordering-state>${settings.orderingEnabled ? 'Abiertos' : 'Cerrados'}</strong><small>${settings.orderingEnabled ? 'Los clientes pueden enviar pedidos.' : 'La carta solo es informativa.'}</small></div>${switchHTML({ key: 'ordering', label: 'Aceptar pedidos', checked: settings.orderingEnabled, disabled: control.busy.has('ordering') })}</div>
          <div class="control-row"><div><strong>Solo usuarios del piloto</strong><small>${settings.pilotOnly ? 'Solo pueden pedir las cuentas del piloto.' : 'Cualquier cliente con cuenta puede pedir.'}</small></div>${switchHTML({ key: 'pilot-only', label: 'Solo usuarios del piloto', checked: settings.pilotOnly, disabled: !canManagePilot || control.busy.has('pilot-only') })}</div>
        </section>
        <section class="control-card control-card--code" aria-labelledby="control-code-title">
          <h2 id="control-code-title">Código del día</h2>
          ${codeBlock}
        </section>
        <section class="control-card control-card--products" aria-labelledby="control-products-title">
          <h2 id="control-products-title">Agotados <span class="orders-count">${soldOut.length}</span></h2>
          ${soldOut.length ? `<ul class="control-soldout">${soldOut.map((product) => `<li><span>${escapeHTML(product.name)}</span><button type="button" class="order-action order-action--secondary" data-orders-action="restock" data-product-id="${escapeHTML(product.id)}" data-focus-key="restock-${escapeHTML(product.id)}" ${control.busy.has(product.id) ? 'disabled' : ''}>Reponer</button></li>`).join('')}</ul>` : '<p class="control-help">Todo disponible.</p>'}
          <label class="control-search"><span>Buscar producto</span><input type="search" value="${escapeHTML(control.productFilter)}" data-control-input="product-filter" data-focus-key="product-filter" autocomplete="off" placeholder="Latte, tostada…"></label>
          <div class="control-products">${categories.map((category) => `<fieldset><legend>${escapeHTML(categoryLabel(category))}</legend>${visible.filter((product) => product.categoryId === category).map((product) => `<div class="control-product ${product.available ? '' : 'control-product--soldout'}"><span>${escapeHTML(product.name)}</span><small>${product.available ? 'Disponible' : 'Agotado'}</small>${switchHTML({ key: `product:${product.id}`, label: `${product.name} disponible`, checked: product.available, disabled: control.busy.has(product.id) })}</div>`).join('')}</fieldset>`).join('') || '<p class="control-help">Ningún producto coincide.</p>'}</div>
        </section>
        <section class="control-card" aria-labelledby="control-pilot-title">
          <h2 id="control-pilot-title">Usuarios del piloto</h2>
          ${canManagePilot ? `<form class="control-pilot-form" data-control-form="pilot" novalidate><label for="control-pilot-email">Correo de la cuenta del cliente</label><div><input id="control-pilot-email" type="email" inputmode="email" autocomplete="off" value="${escapeHTML(control.pilotEmail)}" data-control-input="pilot-email" data-focus-key="pilot-email" required><button class="order-action" type="submit" ${control.busy.has('pilot') ? 'disabled' : ''}>Añadir</button></div><p class="business-message ${control.pilotMessage.startsWith('✓') ? '' : 'business-message--error'}" role="status">${escapeHTML(control.pilotMessage)}</p></form>
          ${control.pilot.length ? `<ul class="control-pilot">${control.pilot.map((member) => `<li><div><strong>${escapeHTML(member.customer)}</strong><small>${escapeHTML(member.email)}</small></div><button type="button" class="order-action order-action--secondary" data-orders-action="remove-pilot" data-user-id="${escapeHTML(member.userId)}" data-focus-key="remove-${escapeHTML(member.userId)}">Quitar</button></li>`).join('')}</ul>` : '<p class="control-help">Todavía no hay usuarios en el piloto.</p>'}`
            : '<p class="control-help">Solo propietarios y responsables pueden gestionar quién participa en el piloto.</p>'}
        </section>
      </div>`;
  };

  const paintControl = () => {
    paintInto('[data-control-panel]', controlHTML());
  };

  const controlError = (error) => error?.code === 'network_error'
    ? 'Sin conexión. Revisa la red e inténtalo de nuevo.'
    : 'No se ha podido completar la operación. Inténtalo de nuevo.';

  const loadControl = async () => {
    const control = state.control;
    if (control.loading) return;
    control.loading = true;
    control.error = '';
    paintControl();
    try {
      const [settings, code, products, pilot] = await Promise.all([
        getOrderingSettings(businessId),
        getCurrentOrderCode(businessId),
        listBusinessProducts(businessId),
        canManagePilot ? listPilotMembers(businessId) : Promise.resolve([])
      ]);
      Object.assign(control, { settings, code, products: [...products], pilot: [...pilot], loaded: true });
    } catch (error) {
      control.error = controlError(error);
    } finally {
      control.loading = false;
      paintControl();
    }
  };

  const withControlBusy = async (key, operation) => {
    const control = state.control;
    if (control.busy.has(key)) return;
    control.busy.add(key);
    control.error = '';
    paintControl();
    try {
      await operation();
    } catch (error) {
      control.error = controlError(error);
    } finally {
      control.busy.delete(key);
      paintControl();
    }
  };

  const expectOk = (result) => {
    if (result !== 'ok') throw Object.assign(new Error(result), { code: result });
  };

  const toggleControlSwitch = (key, checked) => {
    const control = state.control;
    if (key === 'ordering') {
      return withControlBusy('ordering', async () => {
        expectOk(await setOrderingEnabled(businessId, checked));
        control.settings = { ...control.settings, orderingEnabled: checked };
        announcer?.announce(checked ? 'Pedidos abiertos' : 'Pedidos cerrados');
      });
    }
    if (key === 'pilot-only') {
      return withControlBusy('pilot-only', async () => {
        expectOk(await setOrderingPilotOnly(businessId, checked));
        control.settings = { ...control.settings, pilotOnly: checked };
      });
    }
    if (key.startsWith('product:')) {
      return setAvailability(key.slice('product:'.length), checked);
    }
    return null;
  };

  const setAvailability = (productId, available) => withControlBusy(productId, async () => {
    expectOk(await setProductAvailability(businessId, productId, available));
    state.control.products = state.control.products.map((product) => product.id === productId ? { ...product, available } : product);
    const name = state.control.products.find((product) => product.id === productId)?.name || 'Producto';
    announcer?.announce(`${name}: ${available ? 'disponible' : 'agotado'}`);
  });

  const regenerate = () => withControlBusy('code', async () => {
    const code = await regenerateOrderCode(businessId);
    if (code.status !== 'ok') throw Object.assign(new Error(code.status), { code: code.status });
    state.control.code = code;
    announcer?.announce(`Nuevo código del día: ${code.code.split('').join(' ')}`);
  });

  const addPilot = (email) => withControlBusy('pilot', async () => {
    const clean = String(email || '').trim();
    const control = state.control;
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      control.pilotMessage = 'Introduce un correo válido.';
      return;
    }
    const result = await addPilotMember(businessId, clean);
    const messages = { ok: '✓ Añadido al piloto.', already_member: 'Esta cuenta ya está en el piloto.', user_not_found: 'No hay ninguna cuenta con ese correo. El cliente debe registrarse primero.', not_authorized: 'No tienes permiso para gestionar el piloto.' };
    control.pilotMessage = messages[result] || 'No se ha podido añadir.';
    if (result === 'ok') {
      control.pilotEmail = '';
      control.pilot = [...await listPilotMembers(businessId)];
    }
  });

  const removePilot = (userId) => withControlBusy('pilot', async () => {
    const result = await removePilotMember(businessId, userId);
    if (result !== 'ok' && result !== 'not_found') throw Object.assign(new Error(result), { code: result });
    state.control.pilot = [...await listPilotMembers(businessId)];
    state.control.pilotMessage = '✓ Usuario retirado del piloto.';
  });

  // ---------------------------------------------------------------------------
  // Acciones de pedido.
  // ---------------------------------------------------------------------------
  const changeStatus = async (orderId, status, reason = null) => {
    const order = state.byId.get(orderId);
    if (!order || state.busy.has(orderId)) return 'busy';
    state.busy.add(orderId);
    state.freshIds.delete(orderId);
    paintOrders();
    let result = 'unexpected';
    try {
      result = await updateBusinessOrderStatus(orderId, status, reason);
    } catch (error) {
      result = error?.code || 'unexpected';
    }
    state.busy.delete(orderId);
    if (result === 'ok') {
      const labels = { accepted: 'aceptado', preparing: 'en preparación', served: 'servido', rejected: 'rechazado' };
      announcer?.announce(`Pedido nº ${order.number} ${labels[status] || status}`);
      if (state.message?.tone === 'error') state.message = null;
    } else if (result !== 'reason_required') {
      showMessage(orderErrorText(result, order.number), 'error');
    }
    await monitor.refresh('action');
    paintOrders();
    return result;
  };

  const rejectDialog = (order, error = '') => accessibleDialogMarkup({
    labelledBy: 'reject-order-title',
    describedBy: 'reject-order-description',
    className: 'modal--form business-modal',
    content: `<div class="business-modal__head"><p class="business-kicker">Pedido nº ${order.number} · ${escapeHTML(placeLabel(order.tableLabel))}</p><h2 id="reject-order-title">¿Rechazar el pedido?</h2></div>
      <p id="reject-order-description" class="business-modal__copy">El cliente verá el motivo en su seguimiento. No se puede deshacer.</p>
      <form class="business-modal__form" data-orders-form="reject" novalidate>
        <label for="reject-reason">Motivo (obligatorio)</label>
        <input id="reject-reason" name="reason" type="text" maxlength="${REJECTION_REASON_MAX}" autocomplete="off" required aria-describedby="reject-reason-error" aria-invalid="${error ? 'true' : 'false'}">
        <div class="business-modal__chips" role="group" aria-label="Motivos frecuentes">${QUICK_REASONS.map((reason) => `<button type="button" class="orders-quick-reason" data-quick-reason="${escapeHTML(reason)}">${escapeHTML(reason)}</button>`).join('')}</div>
        <p id="reject-reason-error" class="business-message business-message--error" role="alert">${escapeHTML(error)}</p>
        <div class="business-modal__actions"><button class="business-secondary" type="button" data-orders-action="close-modal">Volver</button><button class="business-primary business-primary--danger" type="submit">Rechazar pedido</button></div>
      </form>`
  });

  const openReject = (orderId) => {
    const order = state.byId.get(orderId);
    if (!order || order.status !== 'pending') return;
    modalOrderId = orderId;
    const dialog = modal.open(rejectDialog(order), { initialFocus: '#reject-reason' });
    bindModal(dialog);
  };

  const confirmDialog = ({ title, copy, confirm, action, danger = false }) => accessibleDialogMarkup({
    labelledBy: 'business-confirm-title',
    describedBy: 'business-confirm-description',
    className: 'modal--form business-modal',
    content: `<div class="business-modal__head"><h2 id="business-confirm-title">${escapeHTML(title)}</h2></div><p id="business-confirm-description" class="business-modal__copy">${escapeHTML(copy)}</p><div class="business-modal__actions"><button class="business-secondary" type="button" data-orders-action="close-modal">Cancelar</button><button class="business-primary ${danger ? 'business-primary--danger' : ''}" type="button" data-orders-action="${action}">${escapeHTML(confirm)}</button></div>`
  });

  let pendingConfirm = null;
  const openConfirm = (options, onConfirm) => {
    pendingConfirm = onConfirm;
    // La opción segura va primero y recibe el foco.
    const dialog = modal.open(confirmDialog(options), { initialFocus: '[data-orders-action="close-modal"]' });
    bindModal(dialog);
  };

  function bindModal(dialog) {
    if (!dialog) return;
    dialog.querySelectorAll('[data-orders-action="close-modal"], [data-ticket-close]').forEach((button) => button.addEventListener('click', () => modal.close({ reason: 'action' })));
    dialog.querySelector('[data-ticket-print]')?.addEventListener('click', (event) => printOrder(event.currentTarget.dataset.ticketPrint));
    dialog.querySelector('[data-orders-action="confirm"]')?.addEventListener('click', async () => {
      const callback = pendingConfirm;
      pendingConfirm = null;
      modal.close({ force: true, reason: 'confirm' });
      await callback?.();
    });
    dialog.querySelectorAll('[data-quick-reason]').forEach((button) => button.addEventListener('click', () => {
      const input = dialog.querySelector('#reject-reason');
      input.value = button.dataset.quickReason;
      input.focus();
    }));
    dialog.querySelector('[data-orders-form="reject"]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const input = form.querySelector('#reject-reason');
      const errorElement = form.querySelector('#reject-reason-error');
      const normalized = normalizeRejectionReason(input.value);
      if (!normalized.ok) {
        input.setAttribute('aria-invalid', 'true');
        errorElement.textContent = normalized.error === 'too_long' ? `Máximo ${REJECTION_REASON_MAX} caracteres.` : 'Indica un motivo breve para el cliente.';
        input.focus();
        return;
      }
      const orderId = modalOrderId;
      form.querySelectorAll('button, input').forEach((element) => { element.disabled = true; });
      const result = await changeStatus(orderId, 'rejected', normalized.value);
      if (result === 'reason_required') {
        form.querySelectorAll('button, input').forEach((element) => { element.disabled = false; });
        input.setAttribute('aria-invalid', 'true');
        errorElement.textContent = 'Indica un motivo breve para el cliente.';
        input.focus();
        return;
      }
      if (modal.isOpen()) modal.close({ force: true, reason: 'submitted' });
    });
  }

  // ---------------------------------------------------------------------------
  // Eventos (delegados en document: los contenedores se repintan).
  // ---------------------------------------------------------------------------
  const handleClick = async (event) => {
    const target = event.target.closest?.('[data-orders-action]');
    if (!target || !appRoot.contains(target) || target.disabled) return;
    const action = target.dataset.ordersAction;
    const orderId = target.dataset.orderId;
    if (action === 'activate-alerts') {
      target.disabled = true;
      const status = await device.activate();
      announcer?.announce(status.soundReady ? 'Avisos activados' : 'No se ha podido activar el sonido');
      paintStatus();
      return;
    }
    if (action === 'ticket') return openTicket(orderId);
    if (action === 'print') return printOrder(orderId);
    if (action === 'accept') return changeStatus(orderId, 'accepted');
    if (action === 'preparing') return changeStatus(orderId, 'preparing');
    if (action === 'served') return changeStatus(orderId, 'served');
    if (action === 'reject') return openReject(orderId);
    if (action === 'reload-control') return loadControl();
    if (action === 'restock') return setAvailability(target.dataset.productId, true);
    if (action === 'generate-code') return regenerate();
    if (action === 'regenerate-code') {
      return openConfirm({ title: '¿Regenerar el código del día?', copy: 'El código actual dejará de funcionar al momento. Cambia también el cartel de la barra.', confirm: 'Regenerar', action: 'confirm' }, regenerate);
    }
    if (action === 'remove-pilot') {
      const userId = target.dataset.userId;
      const member = state.control.pilot.find((item) => item.userId === userId);
      return openConfirm({ title: '¿Quitar del piloto?', copy: `${member?.customer || 'Este cliente'} dejará de poder enviar pedidos mientras el piloto esté limitado.`, confirm: 'Quitar', action: 'confirm', danger: true }, () => removePilot(userId));
    }
    return null;
  };

  const handleChange = (event) => {
    const input = event.target.closest?.('[data-control-switch]');
    if (!input || !appRoot.contains(input)) return;
    const key = input.dataset.controlSwitch;
    const checked = input.checked;
    if (key === 'ordering' && !checked) {
      // Cerrar pedidos afecta a los clientes: se confirma.
      input.checked = true;
      openConfirm({ title: '¿Cerrar los pedidos?', copy: 'Los clientes dejarán de poder enviar pedidos. Los pedidos en curso no se ven afectados.', confirm: 'Cerrar pedidos', action: 'confirm', danger: true }, () => toggleControlSwitch('ordering', false));
      return;
    }
    toggleControlSwitch(key, checked);
  };

  const handleInput = (event) => {
    const input = event.target.closest?.('[data-control-input]');
    if (!input || !appRoot.contains(input)) return;
    if (input.dataset.controlInput === 'product-filter') {
      state.control.productFilter = input.value;
      paintControl();
    }
    if (input.dataset.controlInput === 'pilot-email') state.control.pilotEmail = input.value;
  };

  const handleSubmit = (event) => {
    const form = event.target.closest?.('[data-control-form="pilot"]');
    if (!form || !appRoot.contains(form)) return;
    event.preventDefault();
    addPilot(form.querySelector('[data-control-input="pilot-email"]')?.value);
  };

  appRoot.addEventListener('click', handleClick);
  appRoot.addEventListener('change', handleChange);
  appRoot.addEventListener('input', handleInput);
  appRoot.addEventListener('submit', handleSubmit);

  const destroy = () => {
    stop();
    printCleanup?.();
    appRoot.removeEventListener('click', handleClick);
    appRoot.removeEventListener('change', handleChange);
    appRoot.removeEventListener('input', handleInput);
    appRoot.removeEventListener('submit', handleSubmit);
  };

  // Llamado por business-view tras cada render de la pantalla principal.
  const paint = ({ tab } = {}) => {
    paintStatus();
    paintTabCount();
    if (tab === 'orders') paintOrders();
    if (tab === 'control') {
      if (!state.control.loaded && !state.control.loading) loadControl();
      else paintControl();
    }
  };

  return { start, stop: destroy, paint, pendingCount };
}
