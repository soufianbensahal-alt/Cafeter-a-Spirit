const slugify = (value) => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

function translatedCategory(category, translations, productIds) {
  const translation = translations[category.id] || {};
  const translatedProducts = translation.products || {};

  return {
    ...category,
    ...translation,
    products: category.products.map((product, index) => ({
      ...product,
      ...(translatedProducts[product.name] || {}),
      id: productIds[index]
    }))
  };
}

export function createBilingualMenuCatalog(categories, catalanTranslations) {
  const categoryIds = new Set();
  const productIds = new Set();
  const idsByCategory = new Map();

  for (const category of categories) {
    if (!category.id || categoryIds.has(category.id)) {
      throw new Error(`Identificador de categoría duplicado o vacío: ${category.id || '(vacío)'}`);
    }
    categoryIds.add(category.id);

    const occurrences = new Map();
    const ids = category.products.map((product) => {
      const base = `${category.id}-${slugify(product.name)}`;
      const occurrence = (occurrences.get(base) || 0) + 1;
      occurrences.set(base, occurrence);
      const id = occurrence === 1 ? base : `${base}-${occurrence}`;
      if (!base || productIds.has(id)) throw new Error(`Identificador de producto duplicado: ${id}`);
      productIds.add(id);
      return id;
    });
    idsByCategory.set(category.id, ids);
  }

  const unknownCategories = Object.keys(catalanTranslations).filter((id) => !categoryIds.has(id));
  if (unknownCategories.length) {
    throw new Error(`Traducciones sin categoría: ${unknownCategories.join(', ')}`);
  }

  const es = categories.map((category) => translatedCategory(category, {}, idsByCategory.get(category.id)));
  const ca = categories.map((category) => translatedCategory(category, catalanTranslations, idsByCategory.get(category.id)));

  return Object.freeze({ es: Object.freeze(es), ca: Object.freeze(ca) });
}
