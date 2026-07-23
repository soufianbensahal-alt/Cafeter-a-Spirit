import { MENU_TRANSLATIONS_CA } from './menu.ca.js';

export const MENU_CATEGORIES = [
  {
    id: 'cafes',
    name: 'Cafés',
    notes: ['Bebida de avena +0,30 €', 'Bebida de soja o sin lactosa +0,20 €'],
    products: [
      { name: 'Filtro V60', price: '6,00 €' },
      { name: 'Café con leche XL', price: '3,60 €' },
      { name: 'Latte', price: '2,20 €' },
      { name: 'Flat white', price: '2,60 €' },
      { name: 'Capuccino', price: '2,60 €' },
      { name: 'Capuccino XL', price: '4,20 €' },
      { name: 'Capuccino Caramel', description: 'espresso, leche, caramelo y cacao', price: '3,50 €' },
      { name: 'Capuccino Vainilla', description: 'espresso, leche, vainilla y cacao', price: '3,50 €' },
      { name: 'Iced Capuccino', price: '3,50 €' },
      { name: 'Iced Capuccino Vainilla / Caramelo', price: '4,30 €' },
      { name: 'Iced Coffee', description: 'doble espresso agitado con hielo', price: '3,20 €' },
      { name: 'Bombón', description: 'espresso y leche condensada', price: '2,30 €' },
      { name: 'Café con Leche Bombón', description: 'espresso con leche y leche condensada', price: '3,50 €' },
      { name: 'Vienés', description: 'espresso doble con nata', price: '3,00 €' },
      { name: 'Mokaccino', description: 'espresso con leche y chocolate', price: '3,50 €' },
      { name: 'Dolce Café', description: 'espresso con leche y dulce de leche', price: '3,50 €' },
      { name: 'Affogato', description: 'espresso doble, helado y nata', price: '4,50 €' },
      { name: 'Chai Latte Coffee', price: '4,50 €' }
    ]
  },
  {
    id: 'bebidas',
    name: 'Bebidas',
    products: [
      { name: 'Chai Latte', price: '3,50 €' },
      { name: 'Iced Chai Latte', price: '4,30 €' },
      { name: 'Chocolate a la taza', price: '3,50 €' },
      { name: 'Suizo', description: 'chocolate a la taza y nata', price: '4,20 €' },
      { name: 'Chaicolate', price: '4,90 €' },
      { name: 'Matcha Latte', price: '4,20 €' },
      { name: 'Iced Matcha Latte', price: '5,00 €' },
      { name: 'Té, Rooibos e Infusiones', price: '2,50 €' },
      { name: 'Cervezas artesanas', price: '' }
    ]
  },
  {
    id: 'smoothies',
    name: 'Smoothies',
    products: [
      { name: 'Energy', description: 'zumo de naranja, zanahoria, jengibre y leche', price: '5,90 €' },
      { name: 'Vitality', description: 'fresa, plátano y zumo de naranja', price: '5,90 €' },
      { name: 'Pink', description: 'remolacha, plátano, frutos rojos y leche', price: '5,90 €' },
      { name: 'Caribeño', description: 'mango, plátano y zumo de naranja', price: '5,90 €' },
      { name: 'Coco Kiss', description: 'coco, fresa y plátano', price: '5,90 €' },
      { name: 'Açai power', description: 'açai, plátano, mantequilla de cacahuete y bebida de avena', price: '7,35 €' },
      { name: 'Zumo de Naranja', description: 'recién exprimido', price: '3,60 €' }
    ]
  },
  {
    id: 'batidos',
    name: 'Batidos',
    intro: 'Leche fresca de vaca, helado y sabor a elegir.',
    notes: ['Suplemento de nata +1,00 €'],
    products: [
      { name: 'Fresa', price: '5,10 €' },
      { name: 'Plátano', price: '5,10 €' },
      { name: 'Coco', price: '5,10 €' },
      { name: 'Piña', price: '5,10 €' },
      { name: 'Frutos del bosque', price: '5,10 €' },
      { name: 'Vainilla', price: '5,10 €' },
      { name: 'Chocolate', price: '5,10 €' },
      { name: 'Fresa y Plátano', price: '5,90 €' },
      { name: 'Chocolate y Plátano', price: '5,90 €' },
      { name: 'Coco y Plátano', price: '5,90 €' },
      { name: 'Piña y Coco', price: '5,90 €' },
      { name: 'Oreo', price: '5,90 €' },
      { name: 'Kinder', price: '5,90 €' },
      { name: 'Lotus', price: '5,90 €' }
    ]
  },
  {
    id: 'protein',
    name: 'Protein',
    products: [
      { name: 'Pre-entreno', description: 'proteína de vainilla, bebida de avena, café, plátano y canela', price: '7,90 €' },
      { name: 'Post-entreno', description: 'proteína de vainilla, bebida de avena, plátano, arándanos y jengibre', price: '7,90 €' }
    ]
  },
  {
    id: 'bowls',
    name: 'Bowls',
    notes: ['Granola sin gluten'],
    products: [
      { name: 'Açai Bowl', description: 'fruta del tiempo, plátano, crema de cacahuete, granola y coco rallado', price: '10,90 €' },
      { name: 'Yogur Bowl', description: 'yogur griego, granola, fruta de temporada y plátano', price: '9,40 €' }
    ]
  },
  {
    id: 'tostadas',
    name: 'Tostadas',
    intro: 'En pan de chía, crujientes y sabrosas desde el primer bocado.',
    notes: ['Opción de pan sin gluten +1,50 €'],
    products: [
      { name: 'Americana', description: 'con mantequilla de cacahuete, plátano, frutos rojos y lotus', price: '7,60 €' },
      { name: 'Good day', description: 'con queso crema, plátano, fresas, nueces y miel', price: '8,05 €' },
      { name: 'Aguacate', description: 'con aguacate, tomate cherry y huevo', price: '8,70 €', priceNote: '+2 € queso brie' },
      { name: 'Vegana', description: 'con hummus, aguacate, lechugas, tomate cherry y almendras trituradas', price: '7,85 €', tags: ['Vegano'] },
      { name: 'Salmón', description: 'con queso crema, aguacate y salmón ahumado', price: '12,15 €' },
      { name: 'Spirit', description: 'con philadelphia, pavo, huevo y aguacate', price: '9,60 €' },
      { name: 'Ibérica', description: 'con tomate frotado, jamón ibérico, tomates cherry y huevo', price: '11,10 €' },
      { name: 'Mediterránea', description: 'con queso cottage, aguacate, jamón ibérico y tomate cherry', price: '13,10 €' }
    ]
  },
  {
    id: 'molletes',
    name: 'Molletes',
    intro: 'Planchados al momento.',
    notes: ['Opción de pan sin gluten +1,00 €'],
    products: [
      { name: 'Bikini', description: 'jamón dulce y queso danés', price: '4,50 €' },
      { name: 'Bikini Pavo', description: 'pavo natural y queso danés', price: '5,30 €' },
      { name: 'Jamón y Brie', description: 'jamón salado y brie', price: '5,95 €', priceNote: '+2 € jamón ibérico' },
      { name: 'Mallorquín', description: 'sobrasada, queso danés y miel', price: '5,80 €' },
      { name: 'Salmón', description: 'salmón, queso crema y aguacate', price: '10,05 €' },
      { name: 'Gorgonzola', description: 'gorgonzola, bacon y pera', price: '6,90 €' },
      { name: 'Vegetal', description: 'queso danés, tomate, lechugas, pepinillos y mayonesa', price: '5,70 €', priceNote: '+2 € pollo / atún / pavo' },
      { name: 'Spirit', description: 'jamón dulce, queso, tomate y salsa rosa', price: '5,80 €' },
      { name: 'Pollo', description: 'pan con tomate, pechuga de pollo, bacon y cheddar', price: '8,90 €' },
      { name: 'Ternera', description: 'brisket de ternera, queso danés, pepinillos y mostaza ligera', price: '9,20 €' },
      { name: 'Proteico', description: 'jamón dulce, queso danés y huevo revuelto', price: '6,50 €' }
    ]
  },
  {
    id: 'benedict',
    name: 'Benedict',
    intro: 'Dos huevos escalfados sobre pan de chía, con salsa holandesa y acompañado de ensalada.',
    notes: ['Opción de pan sin gluten +1,50 €'],
    products: [
      { name: 'Salmón', price: '11,75 €' },
      { name: 'Salmón y Aguacate', price: '14,95 €' },
      { name: 'Aguacate', price: '10,50 €' },
      { name: 'Bacon', price: '10,80 €' },
      { name: 'Jamón Ibérico', price: '14,35 €' },
      { name: 'Jamón Ibérico y Aguacate', price: '17,05 €' },
      { name: 'Pavo y Aguacate', price: '13,90 €' }
    ]
  },
  {
    id: 'pancakes',
    name: 'Pancakes',
    intro: '3 esponjosos pancakes caseros.',
    products: [
      { name: 'Me salto la Dieta', description: 'nutella, fresa y plátano', price: '9,10 €' },
      { name: 'Lotus', description: 'crema de lotus, fruta de temporada, galleta triturada y nata', price: '11,50 €' },
      { name: 'Arce Pancake', description: 'mantequilla, sirope de arce, lotus y azúcar glass', price: '9,10 €' },
      { name: 'Bacon Pancake', description: 'mantequilla, sirope de arce, bacon y huevo', price: '13,75 €' }
    ]
  },
  {
    id: 'creps',
    name: 'Creps',
    intro: 'El secreto está en la masa: casera, local y llena de amor.',
    notes: ['Toppings +1,50 €: nata, plátano, lacasitos, helado, fruta, oreo, kit kat, twix, coco, nueces o lotus'],
    products: [
      { name: 'Nutella', price: '5,10 €' },
      { name: 'Crema Lotus', price: '5,10 €' },
      { name: 'Chocolate con leche', price: '5,90 €' },
      { name: 'Chocolate blanco', price: '5,90 €' },
      { name: 'Chocolate negro', price: '5,90 €' },
      { name: 'Dulce de leche', price: '5,10 €' },
      { name: 'Leche condensada', price: '5,10 €' }
    ]
  },
  {
    id: 'creps-saladas',
    name: 'Creps saladas',
    notes: ['Opción de pan sin gluten +1,50 €'],
    products: [
      { name: 'Bikini', description: 'jamón dulce y queso danés', price: '6,40 €' },
      { name: 'Mallorquina Prime', description: 'sobrasada, queso danés y miel', price: '7,30 €' },
      { name: 'Tres quesos', description: 'queso danés, roquefort y brie', price: '8,40 €' },
      { name: 'Nórdica', description: 'salmón, queso crema y aguacate', price: '12,90 €' },
      { name: 'Avocado', description: 'jamón dulce, queso, aguacate y queso crema', price: '9,80 €' },
      { name: 'Paraíso', description: 'brie, nueces y miel', price: '7,10 €' },
      { name: 'Bacon y queso', price: '7,80 €' }
    ]
  },
  {
    id: 'bocadillos',
    name: 'Bocadillos',
    intro: 'Al estilo NY, en pan brioche redondo y sin patatas.',
    notes: ['Opción de pan sin gluten +1,50 €'],
    products: [
      { name: 'Brisket', description: 'brisket de ternera cocido a baja temperatura al estilo NY, con cebolla caramelizada, queso brie fundido y mostaza ligera', price: '11,00 €' },
      { name: 'Cheese bacon', description: 'brisket de ternera cocido a baja temperatura al estilo NY, con bacon, cebolla caramelizada y cheddar', price: '10,80 €' }
    ]
  },
  {
    id: 'omelette',
    name: 'Omelette',
    intro: 'Acompañada de hummus y aguacate.',
    notes: ['Opción de pan sin gluten +1,00 €'],
    products: [
      { name: 'Pork', description: 'cama de tortilla con deliciosa y melosa carne desmechada de cerdo y cebolla encurtida', price: '8,90 €' },
      { name: 'Salmón', description: 'cama de tortilla con salmón ahumado bañado en crema holandesa', price: '9,90 €' }
    ]
  },
  {
    id: 'extras',
    name: 'Extras',
    products: [
      { name: 'Salmón', price: '4,90 €' },
      { name: 'Aguacate', price: '2,90 €' },
      { name: 'Bacon', price: '2,90 €' },
      { name: 'Huevo poché', price: '2,50 €' },
      { name: 'Huevo frito / revuelto', price: '1,90 €' },
      { name: 'Jamón Ibérico', price: '3,90 €' },
      { name: 'Pollo', price: '4,90 €' },
      { name: 'Pan', price: '1,00 €' }
    ]
  }
];

export function getMenuCategories(language = 'es') {
  if (language !== 'ca') return MENU_CATEGORIES;

  return MENU_CATEGORIES.map((category) => {
    const translation = MENU_TRANSLATIONS_CA[category.id] || {};
    const translatedProducts = translation.products || {};

    return {
      ...category,
      ...translation,
      products: category.products.map((product) => ({
        ...product,
        ...(translatedProducts[product.name] || {})
      }))
    };
  });
}
