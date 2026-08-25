export const normalizeMenuText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es');

const productRow = (product, escapeHTML) => `<article class="menu-product">
  <div class="menu-product__main">
    <h3>${escapeHTML(product.name)}</h3>
    ${product.description ? `<p>${escapeHTML(product.description)}</p>` : ''}
    ${product.tags?.length ? `<div class="menu-product__tags">${product.tags.map((tag) => `<span class="menu-note-chip">${escapeHTML(tag)}</span>`).join('')}</div>` : ''}
  </div>
  <div class="menu-product__price">
    ${product.price ? `<strong>${escapeHTML(product.price)}</strong>` : ''}
    ${product.priceNote ? `<small>${escapeHTML(product.priceNote)}</small>` : ''}
  </div>
</article>`;

const categorySection = (category, escapeHTML) => `<section class="menu-category" id="menu-category-${category.id}" data-menu-section="${category.id}">
  <header class="menu-category__head">
    <h2>${escapeHTML(category.name)}</h2>
    ${category.intro ? `<p>${escapeHTML(category.intro)}</p>` : ''}
    ${category.notes?.length ? `<div class="menu-notes">${category.notes.map((note) => `<span class="menu-note-chip">${escapeHTML(note)}</span>`).join('')}</div>` : ''}
  </header>
  <div class="menu-products">${category.products.map((product) => productRow(product, escapeHTML)).join('')}</div>
</section>`;

export function renderMenuContent({ categories, query, icons, translate, escapeHTML }) {
  const normalizedQuery = normalizeMenuText(query.trim());
  if (!normalizedQuery) return categories.map((category) => categorySection(category, escapeHTML)).join('');

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

  return `<section class="menu-results" aria-live="polite"><h2>${translate('menuResults')}</h2>${groups.map(({ category, products }) => `<section class="menu-result-group"><h3>${escapeHTML(category.name)}</h3><div class="menu-products">${products.map((product) => productRow(product, escapeHTML)).join('')}</div></section>`).join('')}</section>`;
}

export function renderMenuScreen({ categories, query, activeCategory, icons, translate, escapeHTML, brandLogo }) {
  return `<main class="app-shell menu-shell"><section class="menu-screen">
    <header class="menu-sticky">
      <div class="menu-titlebar">
        <button class="menu-icon-button" type="button" data-action="close-menu" aria-label="${translate('menuBack')}">${icons.arrowLeft}</button>
        <div class="menu-brand">${brandLogo('menu')}</div>
        <h1>${translate('menuTitle')}</h1>
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
    <div class="menu-content" data-menu-content>${renderMenuContent({ categories, query, icons, translate, escapeHTML })}</div>
    <button class="menu-to-top" type="button" data-action="menu-top" aria-label="${translate('menuTop')}">${icons.arrowUp}</button>
  </section></main>`;
}
