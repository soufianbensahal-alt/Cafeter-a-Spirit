// Promoción de registro: un único componente para el login (variante «hero»,
// con la mini tarjeta de sellos animada) y para la captación del invitado en
// la carta, el carrito y el seguimiento (variante «compact»). Render puro
// (tests/signup-promo.test.js). El número de sellos sale de la configuración
// real (get_public_loyalty_program); si no se conoce, el texto va sin número.

export const SIGNUP_PROMO_COPY = Object.freeze({
  es: Object.freeze({
    signupPromoTitle: 'Crea tu cuenta y llévate un café gratis',
    signupPromoStamp: 'Suma un sello en cada consumición.',
    signupPromoRewardCount: 'Con {n} sellos, tu próximo café es gratis.',
    signupPromoReward: 'Completa tu tarjeta y tu próximo café es gratis.',
    signupPromoTracking: 'Sigue tus pedidos desde el móvil.',
    signupPromoAction: 'Crear mi cuenta',
    signupPromoGuestNote: 'Conservarás tus pedidos de hoy.'
  }),
  ca: Object.freeze({
    signupPromoTitle: 'Crea el teu compte i emporta’t un cafè gratis',
    signupPromoStamp: 'Suma un segell a cada consumició.',
    signupPromoRewardCount: 'Amb {n} segells, el teu pròxim cafè és gratis.',
    signupPromoReward: 'Completa la targeta i el teu pròxim cafè és gratis.',
    signupPromoTracking: 'Segueix les teves comandes des del mòbil.',
    signupPromoAction: 'Crear el meu compte',
    signupPromoGuestNote: 'Conservaràs les comandes d’avui.'
  })
});

// Sólo un entero razonable cuenta como número de sellos; cualquier otra cosa
// (sin programa, error, valor raro) deja el texto sin número.
export function promoStampsRequired(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 50 ? number : null;
}

// Huecos de la mini tarjeta: los sellos reales si caben; si no, una tarjeta
// decorativa de 6.
export const PROMO_DEFAULT_SLOTS = 6;
export const promoSlots = (stampsRequired) => {
  const stamps = promoStampsRequired(stampsRequired);
  return stamps && stamps >= 4 && stamps <= 12 ? stamps : PROMO_DEFAULT_SLOTS;
};

// Línea de tiempo (ms). Debe coincidir con styles.css (.signup-promo--animate).
export const PROMO_TIMING = Object.freeze({ start: 250, step: 90, paw: 320, cupGap: 120, cup: 460, glow: 900 });
export const promoCupDelay = (slots) => PROMO_TIMING.start + slots * PROMO_TIMING.step + PROMO_TIMING.cupGap;
export const promoDurationMs = (slots) => promoCupDelay(slots) + PROMO_TIMING.cup + PROMO_TIMING.glow;

const PAW = '<svg class="signup-promo__paw" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><ellipse cx="12" cy="16.2" rx="5.1" ry="4.3"/><ellipse cx="5.4" cy="10.6" rx="2.1" ry="2.6" transform="rotate(-20 5.4 10.6)"/><ellipse cx="9.5" cy="6.4" rx="2.2" ry="2.8" transform="rotate(-6 9.5 6.4)"/><ellipse cx="14.5" cy="6.4" rx="2.2" ry="2.8" transform="rotate(6 14.5 6.4)"/><ellipse cx="18.6" cy="10.6" rx="2.1" ry="2.6" transform="rotate(20 18.6 10.6)"/></svg>';
const CUP = '<svg class="signup-promo__cup" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 8h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM17 10h2a3 3 0 0 1 0 6h-2M7 4c0 1 1 1 1 2M11 3c0 1 1 1 1 3M15 4c0 1 1 1 1 2"/></svg>';

// Mini tarjeta decorativa (aria-hidden): huecos que se llenan huella a huella
// y, al final, el café gratis con un brillo. pending = aún sin datos: huecos
// vacíos y sin animar. elapsed = ms ya transcurridos de la animación (si el
// login se repinta a mitad, sigue por donde iba en lugar de reiniciarse).
function stampCard({ slots, motion }) {
  const paws = Array.from({ length: slots }, (_, index) => `<span class="signup-promo__slot" style="--i:${index}">${motion === 'pending' ? '' : PAW}</span>`).join('');
  return `<div class="signup-promo__card" aria-hidden="true" data-promo-card style="--slots:${slots}">${paws}<span class="signup-promo__slot signup-promo__slot--reward">${motion === 'pending' ? '' : CUP}</span></div>`;
}

const benefits = (t, stampsRequired) => {
  const stamps = promoStampsRequired(stampsRequired);
  const reward = stamps ? t('signupPromoRewardCount', { n: String(stamps) }) : t('signupPromoReward');
  return `<ul class="signup-promo__benefits">
      <li>${PAW}<span>${t('signupPromoStamp')}</span></li>
      <li>${PAW}<span>${reward}</span></li>
      <li>${PAW}<span>${t('signupPromoTracking')}</span></li>
    </ul>`;
};

/**
 * @param {{
 *   translate: (key: string, values?: Record<string, string>) => string,
 *   variant?: 'hero' | 'compact',
 *   stampsRequired?: number | null,
 *   id?: string,
 *   action?: string,
 *   showAction?: boolean,
 *   motion?: 'pending' | 'animate' | 'static',
 *   elapsed?: number
 * }} options
 */
export function renderSignupPromo({
  translate: t,
  variant = 'compact',
  stampsRequired = null,
  id = 'signup-promo',
  action = 'guest-create-account',
  showAction = true,
  motion = 'static',
  elapsed = 0
}) {
  const hero = variant === 'hero';
  const button = showAction
    ? `<button class="primary-button signup-promo__action" type="button" data-action="${action}">${t('signupPromoAction')}</button>`
    : '';
  if (!hero) {
    return `<aside class="signup-promo signup-promo--compact" aria-labelledby="${id}-title" data-signup-promo>
    <p id="${id}-title" class="signup-promo__title">${PAW}<span>${t('signupPromoTitle')}</span></p>
    ${benefits(t, stampsRequired)}
    <p class="signup-promo__note">${t('signupPromoGuestNote')}</p>
    ${button}
  </aside>`;
  }
  const slots = promoSlots(stampsRequired);
  const animate = motion === 'animate';
  const offset = animate ? ` style="--promo-elapsed:${Math.max(0, Math.round(Number(elapsed) || 0))}ms"` : '';
  return `<section class="signup-promo signup-promo--hero${animate ? ' signup-promo--animate' : ''}" aria-labelledby="${id}-title" data-signup-promo${offset}>
    <h2 id="${id}-title" class="signup-promo__title">${t('signupPromoTitle')}</h2>
    ${stampCard({ slots, motion })}
    ${benefits(t, stampsRequired)}
    ${button}
  </section>`;
}
