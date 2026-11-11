import {
  CART_LIMITS,
  PICKUP_TABLE_LABEL,
  canCheckout,
  cartTotalCents,
  formatCents,
  isProductOrderable,
  noteLength,
  unavailableCartItems
} from '../services/cart-rules.js';
import {
  ORDER_PROGRESS_STEPS,
  isClosedUnsuccessfully,
  orderProgressIndex
} from '../services/order-monitor.js';

const screenHeader = ({ action, label, icons, eyebrow, title, extra = '' }) => `<header class="order-header">
  <button class="menu-icon-button" type="button" data-action="${action}" aria-label="${label}">${icons.arrowLeft}</button>
  ${extra}
</header>
<p class="eyebrow">${eyebrow}</p>
<h1 tabindex="-1" data-screen-heading>${title}</h1>`;

const emptyState = ({ title, copy, action = '', label = '' }) => `<div class="empty order-empty"><div><div class="empty__icon" aria-hidden="true">☕</div><h2>${title}</h2><p>${copy}</p>${action ? `<button class="primary-button" type="button" data-action="${action}">${label}</button>` : ''}</div></div>`;

export function renderCartScreen({ cart, products, productName, orderingOpen = true, closedKey = 'orderErrorClosed', translate: t, escapeHTML, icons, lang }) {
  const header = screenHeader({ action: 'back-to-menu', label: t('cartBack'), icons, eyebrow: t('cartEyebrow'), title: t('cartTitle') });
  if (!cart.items.length) {
    return `<main class="app-shell"><section class="screen order-screen">${header}${emptyState({ title: t('cartEmptyTitle'), copy: t('cartEmptyCopy'), action: 'back-to-menu', label: t('cartBrowseMenu') })}</section></main>`;
  }
  const unavailable = new Set(orderingOpen ? unavailableCartItems(cart, products) : []);
  const lines = cart.items.map((item) => {
    const product = products.get(item.productId);
    const name = escapeHTML(productName(item.productId));
    const orderable = isProductOrderable(product);
    const unit = orderable ? formatCents(product.priceCents, lang) : '';
    const lineTotal = orderable ? formatCents(product.priceCents * item.quantity, lang) : '';
    return `<li class="cart-line ${unavailable.has(item.productId) ? 'cart-line--unavailable' : ''}">
      <div class="cart-line__info">
        <h2 class="cart-line__name">${name}</h2>
        ${orderable ? `<p class="cart-line__unit">${unit}</p>` : orderingOpen ? `<p class="cart-line__warning">${t('cartUnavailable')}</p>` : ''}
      </div>
      <div class="cart-line__controls">
        <div class="stepper" role="group" aria-label="${t('cartQuantity', { name, count: item.quantity })}">
          <button class="stepper__button" type="button" data-cart-dec="${escapeHTML(item.productId)}" aria-label="${t('cartDecrease', { name })}">−</button>
          <span class="stepper__value" aria-hidden="true">${item.quantity}</span>
          <button class="stepper__button" type="button" data-cart-inc="${escapeHTML(item.productId)}" aria-label="${t('cartIncrease', { name })}" ${item.quantity >= CART_LIMITS.maxQuantity || !orderable ? 'disabled' : ''}>+</button>
        </div>
        <button class="cart-line__remove" type="button" data-cart-remove="${escapeHTML(item.productId)}" aria-label="${t('cartRemove', { name })}">${icons.close}</button>
      </div>
      ${lineTotal ? `<strong class="cart-line__total">${lineTotal}</strong>` : ''}
    </li>`;
  }).join('');
  const total = formatCents(cartTotalCents(cart, products), lang);
  const ready = orderingOpen && canCheckout(cart, products);
  return `<main class="app-shell"><section class="screen order-screen">${header}
    <ul class="cart-list" aria-label="${t('orderItemsLabel')}">${lines}</ul>
    ${!orderingOpen ? `<p class="order-notice order-notice--warning" role="alert">${t(closedKey)}</p>` : unavailable.size ? `<p class="order-notice order-notice--warning" role="alert">${t('cartUnavailableNotice')}</p>` : ''}
    <div class="field cart-note">
      <label for="cart-note">${t('cartNote')}</label>
      <textarea id="cart-note" name="note" rows="3" maxlength="${CART_LIMITS.noteMaxLength}" placeholder="${t('cartNotePlaceholder')}" aria-describedby="cart-note-counter" data-cart-note>${escapeHTML(cart.note)}</textarea>
      <small id="cart-note-counter" class="field-note cart-note__counter" data-cart-note-counter>${t('cartNoteCounter', { count: noteLength(cart.note) })}</small>
    </div>
    <div class="order-summary">
      <div class="order-summary__row"><span>${t('cartEstimatedTotal')}</span><strong data-cart-total>${total}</strong></div>
      <p class="order-summary__copy">${t('cartEstimatedCopy')} ${t('checkoutPayAtVenue')}</p>
    </div>
    <button class="primary-button order-cta" type="button" data-action="open-checkout" ${ready ? '' : 'disabled'}>${t('cartContinue')}</button>
  </section></main>`;
}

// Aviso dentro de la confirmación cuando algo del carrito se agota con ella
// abierta. names: nombres ya legibles (sin escapar) de los productos agotados.
export function renderCheckoutSoldOutNotice({ names, translate: t, escapeHTML }) {
  if (!names?.length) return '';
  const list = names.map((name) => escapeHTML(name)).join(', ');
  return `<div class="order-notice order-notice--warning checkout-soldout" tabindex="-1" data-checkout-soldout>
    <p>${t(names.length === 1 ? 'checkoutSoldOutOne' : 'checkoutSoldOutMany', { names: list })}</p>
    <button class="primary-button primary-button--light checkout-soldout__back" type="button" data-action="checkout-back-to-cart">${t('checkoutBackToCart')}</button>
  </div>`;
}

export function renderCheckoutContent({ cart, products, translate: t, escapeHTML = (value) => String(value), lang, draft = null, soldOutNames = [], submitting = false }) {
  const total = formatCents(cartTotalCents(cart, products), lang);
  const pickup = Boolean(draft?.pickup);
  const blocked = soldOutNames.length > 0;
  return `<div class="sheet-head"><div><p class="eyebrow">${t('checkoutEyebrow')}</p><h2 id="checkout-dialog-title">${t('checkoutTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div>
  <form class="sheet-form" data-form="checkout" novalidate>
    <div class="field">
      <label for="checkout-code">${t('checkoutCode')}</label>
      <input id="checkout-code" class="checkout-code" name="code" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="one-time-code" enterkeyhint="next" aria-describedby="checkout-code-hint checkout-code-error" aria-invalid="false" required value="${escapeHTML(draft?.code || '')}" data-checkout-code>
      <small id="checkout-code-hint" class="field-note">${t('checkoutCodeHint')}</small>
      <small id="checkout-code-error" class="field-error" data-checkout-code-error></small>
    </div>
    <fieldset class="checkout-where">
      <legend>${t('checkoutWhere')}</legend>
      <div class="field">
        <label for="checkout-table">${t('checkoutTable')}</label>
        <input id="checkout-table" name="table" type="text" maxlength="${CART_LIMITS.tableMaxLength}" autocomplete="off" placeholder="${t('checkoutTablePlaceholder')}" aria-describedby="checkout-table-error" aria-invalid="false" value="${escapeHTML(draft?.table || '')}" ${pickup ? 'disabled' : 'required'} data-checkout-table>
        <small id="checkout-table-error" class="field-error" data-checkout-table-error></small>
      </div>
      <label class="check checkout-pickup"><input type="checkbox" name="pickup" value="${PICKUP_TABLE_LABEL}" ${pickup ? 'checked' : ''} data-checkout-pickup><span>${t('checkoutPickup')}</span></label>
    </fieldset>
    <div class="order-summary order-summary--compact">
      <div class="order-summary__row"><span>${t('cartEstimatedTotal')}</span><strong data-checkout-total>${total}</strong></div>
      <p class="order-summary__pay"><strong>${t('checkoutPayAtVenue')}</strong> ${t('cartEstimatedCopy')}</p>
    </div>
    <div data-checkout-availability>${renderCheckoutSoldOutNotice({ names: soldOutNames, translate: t, escapeHTML })}</div>
    <div class="form-error" role="alert" data-checkout-error></div>
    <button class="primary-button" type="submit" data-checkout-submit ${submitting || blocked ? 'disabled' : ''}>${submitting ? t('checkoutSending') : t('checkoutSubmit')}</button>
  </form>`;
}

const statusLabel = (t, status) => t(`orderStatus_${status}`);

export const placeLabel = (t, escapeHTML, tableLabel) => tableLabel === PICKUP_TABLE_LABEL
  ? t('orderPickupLabel')
  : t('orderTableLabel', { table: escapeHTML(tableLabel) });

const formatTime = (value, lang) => new Intl.DateTimeFormat(lang === 'ca' ? 'ca-ES' : 'es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function progress(t, status) {
  if (isClosedUnsuccessfully(status)) return '';
  const current = orderProgressIndex(status);
  return `<ol class="order-progress" aria-label="${t('orderProgressLabel')}">${ORDER_PROGRESS_STEPS.map((step, index) => `<li class="order-progress__step ${index < current ? 'order-progress__step--done' : ''} ${index === current ? 'order-progress__step--current' : ''}" ${index === current ? 'aria-current="step"' : ''}><span class="order-progress__dot" aria-hidden="true"></span><span>${statusLabel(t, step)}</span></li>`).join('')}</ol>`;
}

export function renderOrderTrackingScreen({ order, loading, offline, productName, translate: t, escapeHTML, icons, lang }) {
  const title = order ? t('orderNumber', { number: order.number }) : t('orderTrackingEyebrow');
  const header = screenHeader({ action: 'order-back', label: t('orderTrackingBack'), icons, eyebrow: t('orderTrackingEyebrow'), title });
  if (!order) {
    return `<main class="app-shell"><section class="screen order-screen">${header}<div class="order-loading" role="status">${loading ? `<span class="auth-spinner" aria-hidden="true"></span><p>${t('orderLoading')}</p>` : `<p>${t('orderNotFound')}</p>`}</div></section></main>`;
  }
  const items = order.items.map((item) => `<li class="order-item"><span class="order-item__qty">${item.quantity}×</span><span class="order-item__name">${escapeHTML(productName(item.productId, item.productName))}</span><span class="order-item__total">${formatCents(item.lineTotalCents, lang)}</span></li>`).join('');
  return `<main class="app-shell"><section class="screen order-screen" data-order-tracking="${escapeHTML(order.id)}">${header}
    ${offline ? `<p class="order-notice" role="status">${t('orderLiveOffline')}</p>` : ''}
    <article class="order-status order-status--${order.status}" data-order-status>
      <span class="order-status__chip">${statusLabel(t, order.status)}</span>
      <p class="order-status__copy">${t(`orderStatusCopy_${order.status}`)}</p>
      ${order.status === 'rejected' && order.rejectionReason ? `<p class="order-status__reason">${t('orderRejectionReason', { reason: escapeHTML(order.rejectionReason) })}</p>` : ''}
      ${progress(t, order.status)}
    </article>
    <section class="order-detail" aria-labelledby="order-detail-title">
      <h2 id="order-detail-title" class="order-detail__place">${placeLabel(t, escapeHTML, order.tableLabel)} · ${formatTime(order.createdAt, lang)}</h2>
      <ul class="order-items" aria-label="${t('orderItemsLabel')}">${items}</ul>
      ${order.note ? `<p class="order-detail__note"><strong>${t('orderNoteLabel')}:</strong> ${escapeHTML(order.note)}</p>` : ''}
      <div class="order-summary__row order-detail__total"><span>${t('orderTotal')}</span><strong>${formatCents(order.totalCents, lang)}</strong></div>
      <p class="order-summary__pay">${t('orderPayAtVenue')}</p>
    </section>
    ${order.status === 'pending' ? `<button class="primary-button primary-button--light order-cancel" type="button" data-action="cancel-order">${t('orderCancel')}</button>` : ''}
  </section></main>`;
}

export function renderOrdersScreen({ orders, loading, translate: t, escapeHTML, icons, lang }) {
  const header = screenHeader({ action: 'orders-back', label: t('orderTrackingBack'), icons, eyebrow: t('myOrdersEyebrow'), title: t('myOrders') });
  if (!orders.length) {
    return `<main class="app-shell"><section class="screen order-screen">${header}${loading ? `<div class="order-loading" role="status"><span class="auth-spinner" aria-hidden="true"></span><p>${t('orderLoading')}</p></div>` : emptyState({ title: t('myOrdersEmptyTitle'), copy: t('myOrdersEmptyCopy') })}</section></main>`;
  }
  return `<main class="app-shell"><section class="screen order-screen">${header}<ul class="order-list">${orders.map((order) => `<li><button class="order-row" type="button" data-open-order="${escapeHTML(order.id)}"><span class="order-row__number">${t('orderNumberShort', { number: order.number })}</span><span class="order-row__meta">${placeLabel(t, escapeHTML, order.tableLabel)} · ${formatTime(order.createdAt, lang)} · ${formatCents(order.totalCents, lang)}</span><span class="order-status__chip order-status__chip--${order.status}">${statusLabel(t, order.status)}</span></button></li>`).join('')}</ul></section></main>`;
}

export function renderCancelOrderContent({ translate: t, busy = false }) {
  return `<div class="sheet-head"><div><h2 id="cancel-order-title">${t('orderCancelConfirmTitle')}</h2></div></div><p id="cancel-order-description" class="delete-account-warning">${t('orderCancelConfirmCopy')}</p><div class="delete-account-actions"><button class="primary-button primary-button--light" type="button" data-action="close-sheet">${t('orderCancelKeep')}</button><button class="primary-button primary-button--danger" type="button" data-action="confirm-cancel-order" ${busy ? 'disabled' : ''}>${t('orderCancelConfirm')}</button></div>`;
}

export function renderActiveOrdersBanner({ count, translate: t }) {
  if (!count) return '';
  return `<button class="active-orders-banner" type="button" data-action="open-orders"><span>${count === 1 ? t('myOrdersActiveOne') : t('myOrdersActiveMany', { count })}</span><span aria-hidden="true">›</span></button>`;
}
