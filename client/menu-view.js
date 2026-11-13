export const normalizeMenuText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es');

// ordering = null mantiene la carta puramente informativa. Si existe:
// { products: Map<id, {priceCents, available, inCatalog}>, quantities: Map<id, n>,
//   units: number, totalLabel: string }
export function renderProductOrderControl(product, { ordering, translate, escapeHTML }) {
  if (!ordering) return '';
  const record = ordering.products.get(product.id);
  if (!record || !record.inCatalog) return '';
  const name = escapeHTML(product.name);
  let control;
  if (!record.available) {
    control = `<button class="menu-add menu-add--soldout" type="button" disabled aria-label="${translate('orderSoldOutProduct', { name })}">${translate('orderSoldOut')}</button>`;
  } else {
    const quantity = ordering.quantities.get(product.id) || 0;
    control = `<button class="menu-add" type="button" data-add-product="${escapeHTML(product.id)}" data-product-name="${name}" aria-label="${translate('orderAddProduct', { name })}"><span aria-hidden="true">+</span> ${translate('orderAdd')}</button>${quantity ? `<span class="menu-add__count">${translate('orderInCart', { count: quantity })}</span>` : ''}`;
  }
  return control;
}

const orderSlot = (product, options) => options?.ordering
  ? `<div class="menu-product__order" data-product-order="${options.escapeHTML(product.id)}">${renderProductOrderControl(product, options)}</div>`
  : '';

export function renderCartBar({ ordering, translate }) {
  if (!ordering?.units) return '';
  const units = ordering.units === 1 ? translate('cartUnitsOne') : translate('cartUnitsMany', { count: ordering.units });
  return `<button class="cart-bar" type="button" data-cart-open aria-label="${translate('cartBarLabel', { units, total: ordering.totalLabel })}"><span class="cart-bar__count" aria-hidden="true">${ordering.units}</span><span class="cart-bar__label" aria-hidden="true">${translate('cartView')}</span><strong class="cart-bar__total" aria-hidden="true">${ordering.totalLabel}</strong></button>`;
}

const productRow = (product, escapeHTML, options) => `<article class="menu-product">
  <div class="menu-product__main">
    <h3>${escapeHTML(product.name)}</h3>
    ${product.description ? `<p>${escapeHTML(product.description)}</p>` : ''}
    ${product.tags?.length ? `<div class="menu-product__tags">${product.tags.map((tag) => `<span class="menu-note-chip">${escapeHTML(tag)}</span>`).join('')}</div>` : ''}
  </div>
  <div class="menu-product__price">
    ${product.price ? `<strong>${escapeHTML(product.price)}</strong>` : ''}
    ${product.priceNote ? `<small>${escapeHTML(product.priceNote)}</small>` : ''}
    ${orderSlot(product, options)}
  </div>
</article>`;

const categorySection = (category, escapeHTML, options) => `<section class="menu-category" id="menu-category-${category.id}" data-menu-section="${category.id}">
  <header class="menu-category__head">
    <h2>${escapeHTML(category.name)}</h2>
    ${category.intro ? `<p>${escapeHTML(category.intro)}</p>` : ''}
    ${category.notes?.length ? `<div class="menu-notes">${category.notes.map((note) => `<span class="menu-note-chip">${escapeHTML(note)}</span>`).join('')}</div>` : ''}
  </header>
  <div class="menu-products">${category.products.map((product) => productRow(product, escapeHTML, options)).join('')}</div>
</section>`;

export function renderMenuContent({ categories, query, icons, translate, escapeHTML, ordering = null }) {
  const options = { ordering, translate, escapeHTML };
  const normalizedQuery = normalizeMenuText(query.trim());
  if (!normalizedQuery) return categories.map((category) => categorySection(category, escapeHTML, options)).join('');

  const groups = categories.map((category) => ({
    category,
    products: category.products.filter((product) => normalizeMenuText([
      product.name,
      product.description,
      product.priceNote,
      ...(product.tags || [])
    ].filter(Boolean).join(' ')).includes(normalizedQuery))
  })).filter(({ products }) => products.length);

  if (!groups.length) {
    return `<div class="menu-empty" role="status"><span class="menu-empty__icon" aria-hidden="true">${icons.search}</span><h2>${translate('menuNoResults')}</h2><p>${translate('menuNoResultsCopy')}</p></div>`;
  }

  return `<section class="menu-results" aria-live="polite"><h2>${translate('menuResults')}</h2>${groups.map(({ category, products }) => `<section class="menu-result-group"><h3>${escapeHTML(category.name)}</h3><div class="menu-products">${products.map((product) => productRow(product, escapeHTML, options)).join('')}</div></section>`).join('')}</section>`;
}

// banner: franja bajo la cabecera (invitado / pedir sin cuenta). back: acción
// y etiqueta del botón de la izquierda (por defecto, volver al inicio).
export function renderMenuScreen({ categories, query, activeCategory, icons, translate, escapeHTML, brandLogo, ordering = null, banner = '', back = null }) {
  return `<main class="app-shell menu-shell"><section class="menu-screen ${ordering ? 'menu-screen--ordering' : ''}">
    <header class="menu-sticky">
      <div class="menu-titlebar ${ordering ? 'menu-titlebar--ordering' : ''}">
        <button class="menu-icon-button" type="button" data-action="${back?.action || 'close-menu'}" aria-label="${back?.label || translate('menuBack')}">${icons.arrowLeft}</button>
        <div class="menu-brand">${brandLogo('menu')}</div>
        <h1>${translate('menuTitle')}</h1>
        ${ordering ? `<button class="menu-icon-button" type="button" data-action="open-orders" aria-label="${translate('myOrders')}">${icons.bag}</button>` : ''}
      </div>
      <label class="menu-search">
        <span aria-hidden="true">${icons.search}</span>
        <span class="sr-only">${translate('menuSearch')}</span>
        <input type="search" value="${escapeHTML(query)}" placeholder="${translate('menuSearch')}" autocomplete="off" enterkeyhint="search" data-menu-search>
        <button class="menu-search__clear" type="button" data-menu-clear aria-label="${translate('menuClear')}" ${query ? '' : 'hidden'}>${icons.close}</button>
      </label>
      <nav class="menu-categories" aria-label="${translate('menuTitle')}" data-menu-categories>
        ${categories.map((category) => `<button type="button" class="menu-category-tab ${activeCategory === category.id ? 'menu-category-tab--active' : ''}" data-menu-category="${category.id}" aria-pressed="${activeCategory === category.id}">${escapeHTML(category.name)}</button>`).join('')}
      </nav>
    </header>
    ${banner}
    <div class="menu-content" data-menu-content>${renderMenuContent({ categories, query, icons, translate, escapeHTML, ordering })}</div>
    <button class="menu-to-top" type="button" data-action="menu-top" aria-label="${translate('menuTop')}">${icons.arrowUp}</button>
    ${ordering ? `<div class="cart-bar-slot" data-cart-bar-slot>${renderCartBar({ ordering, translate })}</div>` : ''}
  </section></main>`;
}
