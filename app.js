import {
  completeCustomerPasswordRecovery,
  getCurrentUser,
  getCustomerContext,
  requestCustomerPasswordReset,
  signInCustomerWithOAuth,
  signInCustomer,
  signOut,
  signUpCustomer,
  subscribeToAuthChanges,
  updateCustomerPassword,
  updateCustomerProfile
} from './services/customer-service.js';
import {
  createStampRequest,
  createOwnCustomerMembership,
  getOwnCustomerCard,
  getOwnStampHistory,
  subscribeToOwnStampTransactions,
  StampSessionError
} from './services/stamp-session-service.js';
import {
  earnedRewardDelta,
  hasLoyaltyBalanceChanged,
  shouldStartPolling
} from './services/loyalty-monitor.js';

const isBusinessMode = /^\/cafeteria\/?$/.test(window.location.pathname);
const isPasswordRecoveryRoute = /^\/reset-password\/?$/.test(window.location.pathname)
  || new URLSearchParams(window.location.search).get('auth') === 'recovery';
const isOAuthCallbackRoute = /^\/auth\/callback\/?$/.test(window.location.pathname);

const recoveryLinkError = (() => {
  if (!isPasswordRecoveryRoute) return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get('error_code') || query.get('error_code');
  const error = hash.get('error') || query.get('error');
  if (!code && !error) return null;
  return code || error;
})();

const icons = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 7v14M12 7H7.5a2.5 2.5 0 1 1 2.5-2.5C10 6 12 7 12 7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5C14 6 12 7 12 7Z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10"/></svg>`,
  cup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM17 10h2a3 3 0 0 1 0 6h-2M7 4c0 1 1 1 1 2M11 3c0 1 1 1 1 3M15 4c0 1 1 1 1 2"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-2-2 2c-3.4-1.4-6.2-4.2-7.6-7.6l2-2z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.6Z"/><path d="M8.1 7.5c.2-.5.5-.5.8-.5h.5l1 2.3-.8 1c.8 1.6 2.1 2.9 3.7 3.6l1-.9 2.4 1.1v.6c0 .6-.3 1.1-.8 1.4-.7.4-1.7.5-2.7.2-3.9-1.1-6.4-3.8-6.8-6.5-.1-.9.2-1.7.7-2.3Z"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v11.2a4.3 4.3 0 1 1-3.6-4.2v3.1a1.4 1.4 0 1 0 .7 1.2V3h2.9Z"/><path d="M14 3c.5 2.8 2.2 4.4 5 4.8v3.1a8.6 8.6 0 0 1-5-2"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8h14l1 13H4zM9 9V6a3 3 0 0 1 6 0v3"/></svg>`,
};

const copy = {
  es: {
    navLabel: 'Navegación principal', home: 'Inicio', rewards: 'Premios', history: 'Historial', profile: 'Perfil', skip: 'Omitir', continue: 'Continuar', enter: 'Entrar en Spirit',
    introLabel: 'Introducción automática de Cafetería Spirit.', onboarding1Title: 'Cada café<br>suma', onboarding1Copy: 'Guarda tus sellos sin tarjetas de papel. Cada visita te acerca a tu próximo café.', onboarding1Photo: 'Café de especialidad de Spirit listo para disfrutar.', onboarding2Title: 'Pide sin<br>colas', onboarding2Copy: 'Haz tu pedido desde el móvil y recógelo listo al llegar a Spirit.', onboarding2Photo: 'Brunch de Spirit preparado para recoger.', onboarding3Title: 'Todo Spirit en<br>un solo sitio', onboarding3Copy: 'La carta, tus pedidos y nuestras redes siempre a mano.', onboarding3Photo: 'Selección artesana de Cafetería Spirit.',
    hello: 'Hola', coffeeToday: 'Hoy toca café.', yourCard: 'Tu tarjeta Spirit', freeCoffee: 'Café gratis', stampsLeft: 'Te quedan {count} sellos para tu café gratis', quickAccess: 'Accesos rápidos', viewMenu: 'Ver menú', writeUs: 'Escríbenos', followUs: 'Síguenos', videos: 'Vídeos', leaveReview: 'Déjanos una reseña', delivery: 'Pedir a domicilio',
    rewardsEyebrow: 'Tienes {count} sellos', rewardsTitle: 'Algo bueno<br>te espera.', rewardsCopy: 'Canjea tus sellos en caja y disfruta de tu momento Spirit.', available: 'Disponibles', madeNow: 'Preparado al momento con mucho mimo.', stamps: 'sellos',
    historyEyebrow: 'Tus momentos Spirit', historyTitle: 'Cada visita<br>cuenta.', movements: 'Movimientos', visitStamp: 'Sello por visita', noMovements: 'Aún no hay movimientos', noMovementsCopy: '¡Ven a por tu primer sello! Tu historia Spirit empieza con un café.',
    profileEyebrow: 'Tu espacio', profileTitle: 'Muy tú.<br>Muy Spirit.', yourAccount: 'Tu cuenta', settings: 'Ajustes', personalData: 'Datos personales', notifications: 'Notificaciones', darkMode: 'Modo oscuro', language: 'Idioma', spanish: 'Castellano', catalan: 'Catalán', inviteFriend: 'Invita a un amigo', logout: 'Cerrar sesión',
    personalEyebrow: 'Tu cuenta', personalTitle: 'Datos personales', changePhoto: 'Fotografía de perfil', gallery: 'Galería', camera: 'Cámara', firstName: 'Nombre', lastName: 'Apellidos', email: 'Correo electrónico', emailReadOnly: 'Gestionado por tu cuenta', changePassword: 'Cambiar contraseña', save: 'Guardar', close: 'Cerrar',
    passwordEyebrow: 'Seguridad', passwordTitle: 'Cambiar contraseña', currentPassword: 'Contraseña actual', newPassword: 'Nueva contraseña', confirmPassword: 'Confirmar contraseña', passwordLength: 'La nueva contraseña debe tener al menos 8 caracteres.', passwordMismatch: 'Las contraseñas no coinciden.', passwordIncorrect: 'La contraseña actual no es correcta.', passwordSaved: 'Contraseña actualizada',
    languageEyebrow: 'Preferencias', languageTitle: 'Idioma de la aplicación', welcome: 'Bienvenida a casa', loginTitle: 'Tu café.<br>Tus sellos.', phone: 'Teléfono', namePlaceholder: '¿Cómo te llamas?', privacy: 'Acepto la política de privacidad y el tratamiento de mis datos según el RGPD.', createAccount: 'Crear mi cuenta', signIn: 'Iniciar sesión', password: 'Contraseña', forgotPassword: 'He olvidado mi contraseña', sendRecovery: 'Enviar enlace de recuperación', backToSignIn: 'Volver al acceso', repeatPassword: 'Confirmar nueva contraseña', checkSession: 'Comprobando tu sesión…', authConfirmation: 'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.', recoverySent: 'Si existe una cuenta con ese correo, recibirás un enlace de recuperación.', recoveryEyebrow: 'Seguridad de tu cuenta', recoveryTitle: 'Crea una nueva<br>contraseña.', recoveryCopy: 'Introduce una contraseña segura y repítela para confirmar que está escrita correctamente.', recoveryChecking: 'Validando el enlace de recuperación…', recoveryInvalidTitle: 'El enlace ya no es válido.', recoveryInvalidCopy: 'El enlace ha caducado, ya se ha utilizado o no puede verificarse. Solicita uno nuevo para continuar.', requestAnotherRecovery: 'Solicitar otro enlace', recoveryCompleteTitle: 'Contraseña actualizada.', recoveryCompleteCopy: 'Tu nueva contraseña ya está activa. Puedes continuar con tu cuenta Spirit.', continueToSpirit: 'Continuar en Spirit', recoverySessionMissing: 'No se ha podido validar el enlace. Solicita uno nuevo.', completeRecovery: 'Guardar nueva contraseña',
    requestStamp: 'Solicitar sello', stampRequestTitle: 'Tu código temporal', stampRequestCopy: 'Enséñale el QR o el código al equipo de Spirit.', stampCodeLabel: 'Código de 6 dígitos', stampExpiresIn: 'Caduca en {count} s', stampExpired: 'Esta solicitud ha caducado.', regenerateStamp: 'Generar uno nuevo', generatingStamp: 'Generando código seguro…', stampConfirmed: 'Sello añadido. Tu tarjeta ya está actualizada.', rewardWon: '¡Has conseguido {count} recompensa!', availableAtCafe: 'Disponible en cafetería', unavailableReward: 'Aún no disponible', cardUnavailable: 'Tarjeta todavía no disponible',
    joinClub: 'Activar mi tarjeta', joiningClub: 'Activando tarjeta…', businessMode: 'Ir al modo cafetería', oauthGoogle: 'Continuar con Google', oauthApple: 'Continuar con Apple',
    shareText: 'Descubre Cafetería Spirit · Brunch and Specialty Coffee Montcada', shareCopied: 'Enlace copiado para compartir', invalidImage: 'No se ha podido procesar la imagen.'
  },
  ca: {
    navLabel: 'Navegació principal', home: 'Inici', rewards: 'Premis', history: 'Historial', profile: 'Perfil', skip: 'Omet', continue: 'Continuar', enter: 'Entrar a Spirit',
    introLabel: 'Introducció automàtica de Cafeteria Spirit.', onboarding1Title: 'Cada cafè<br>suma', onboarding1Copy: 'Guarda els teus segells sense targetes de paper. Cada visita t’acosta al teu pròxim cafè.', onboarding1Photo: 'Cafè d’especialitat de Spirit a punt per gaudir.', onboarding2Title: 'Demana sense<br>cues', onboarding2Copy: 'Fes la teva comanda des del mòbil i recull-la preparada en arribar a Spirit.', onboarding2Photo: 'Brunch de Spirit preparat per recollir.', onboarding3Title: 'Tot Spirit en<br>un sol lloc', onboarding3Copy: 'La carta, les teves comandes i les nostres xarxes sempre a mà.', onboarding3Photo: 'Selecció artesana de Cafeteria Spirit.',
    hello: 'Hola', coffeeToday: 'Avui toca cafè.', yourCard: 'La teva targeta Spirit', freeCoffee: 'Cafè gratis', stampsLeft: 'Et queden {count} segells per al teu cafè gratis', quickAccess: 'Accessos ràpids', viewMenu: 'Veure menú', writeUs: 'Escriu-nos', followUs: 'Segueix-nos', videos: 'Vídeos', leaveReview: 'Deixa’ns una ressenya', delivery: 'Demanar a domicili',
    rewardsEyebrow: 'Tens {count} segells', rewardsTitle: 'Una cosa bona<br>t’espera.', rewardsCopy: 'Bescanvia els teus segells a caixa i gaudeix del teu moment Spirit.', available: 'Disponibles', madeNow: 'Preparat al moment amb molta cura.', stamps: 'segells',
    historyEyebrow: 'Els teus moments Spirit', historyTitle: 'Cada visita<br>compta.', movements: 'Moviments', visitStamp: 'Segell per visita', noMovements: 'Encara no hi ha moviments', noMovementsCopy: 'Vine a buscar el teu primer segell! La teva història Spirit comença amb un cafè.',
    profileEyebrow: 'El teu espai', profileTitle: 'Molt tu.<br>Molt Spirit.', yourAccount: 'El teu compte', settings: 'Configuració', personalData: 'Dades personals', notifications: 'Notificacions', darkMode: 'Mode fosc', language: 'Idioma', spanish: 'Castellà', catalan: 'Català', inviteFriend: 'Convida un amic', logout: 'Tancar sessió',
    personalEyebrow: 'El teu compte', personalTitle: 'Dades personals', changePhoto: 'Fotografia de perfil', gallery: 'Galeria', camera: 'Càmera', firstName: 'Nom', lastName: 'Cognoms', email: 'Correu electrònic', emailReadOnly: 'Gestionat pel teu compte', changePassword: 'Canviar contrasenya', save: 'Desar', close: 'Tancar',
    passwordEyebrow: 'Seguretat', passwordTitle: 'Canviar contrasenya', currentPassword: 'Contrasenya actual', newPassword: 'Nova contrasenya', confirmPassword: 'Confirmar contrasenya', passwordLength: 'La nova contrasenya ha de tenir almenys 8 caràcters.', passwordMismatch: 'Les contrasenyes no coincideixen.', passwordIncorrect: 'La contrasenya actual no és correcta.', passwordSaved: 'Contrasenya actualitzada',
    languageEyebrow: 'Preferències', languageTitle: 'Idioma de l’aplicació', welcome: 'Benvinguda a casa', loginTitle: 'El teu cafè.<br>Els teus segells.', phone: 'Telèfon', namePlaceholder: 'Com et dius?', privacy: 'Accepto la política de privacitat i el tractament de les meves dades segons el RGPD.', createAccount: 'Crear el meu compte', signIn: 'Iniciar sessió', password: 'Contrasenya', forgotPassword: 'He oblidat la contrasenya', sendRecovery: 'Enviar enllaç de recuperació', backToSignIn: 'Tornar a l’accés', repeatPassword: 'Confirmar la nova contrasenya', checkSession: 'Comprovant la sessió…', authConfirmation: 'Revisa el correu per confirmar el compte abans d’iniciar sessió.', recoverySent: 'Si existeix un compte amb aquest correu, rebràs un enllaç de recuperació.', recoveryEyebrow: 'Seguretat del teu compte', recoveryTitle: 'Crea una nova<br>contrasenya.', recoveryCopy: 'Introdueix una contrasenya segura i repeteix-la per confirmar que està escrita correctament.', recoveryChecking: 'Validant l’enllaç de recuperació…', recoveryInvalidTitle: 'L’enllaç ja no és vàlid.', recoveryInvalidCopy: 'L’enllaç ha caducat, ja s’ha utilitzat o no es pot verificar. Sol·licita’n un de nou per continuar.', requestAnotherRecovery: 'Sol·licitar un altre enllaç', recoveryCompleteTitle: 'Contrasenya actualitzada.', recoveryCompleteCopy: 'La teva nova contrasenya ja està activa. Pots continuar amb el teu compte Spirit.', continueToSpirit: 'Continuar a Spirit', recoverySessionMissing: 'No s’ha pogut validar l’enllaç. Sol·licita’n un de nou.', completeRecovery: 'Desar la nova contrasenya',
    requestStamp: 'Sol·licitar segell', stampRequestTitle: 'El teu codi temporal', stampRequestCopy: 'Ensenya el QR o el codi a l’equip de Spirit.', stampCodeLabel: 'Codi de 6 dígits', stampExpiresIn: 'Caduca en {count} s', stampExpired: 'Aquesta sol·licitud ha caducat.', regenerateStamp: 'Generar-ne un de nou', generatingStamp: 'Generant un codi segur…', stampConfirmed: 'Segell afegit. La teva targeta ja està actualitzada.', rewardWon: 'Has aconseguit {count} recompensa!', availableAtCafe: 'Disponible a la cafeteria', unavailableReward: 'Encara no disponible', cardUnavailable: 'Targeta encara no disponible',
    joinClub: 'Activar la meva targeta', joiningClub: 'Activant targeta…', businessMode: 'Anar al mode cafeteria', oauthGoogle: 'Continuar amb Google', oauthApple: 'Continuar amb Apple',
    shareText: 'Descobreix Cafeteria Spirit · Brunch and Specialty Coffee Montcada', shareCopied: 'Enllaç copiat per compartir', invalidImage: 'No s’ha pogut processar la imatge.'
  }
};

const defaultProfile = { firstName: 'Cliente', lastName: '', email: '', photo: '' };
const state = {
  screen: isPasswordRecoveryRoute ? 'login' : 'intro', afterIntro: localStorage.getItem('spirit-onboarded') ? 'login' : 'onboarding', onboarding: 0, stamps: 0,
  availableRewards: 0,
  loyaltyGoal: 0,
  rewardDescription: '',
  loyaltyReady: false,
  customerCardId: null,
  loyaltyHistory: [],
  loyaltyHistoryHasMore: false,
  lang: localStorage.getItem('spirit-language') === 'ca' ? 'ca' : 'es',
  theme: document.documentElement.dataset.theme || 'light',
  notifications: localStorage.getItem('spirit-notifications') !== 'false',
  profile: { ...defaultProfile },
  hasBusinessAccess: false,
  needsProfileCompletion: false,
  authStatus: 'checking',
  authMode: isPasswordRecoveryRoute ? (recoveryLinkError ? 'recoveryError' : 'recoveryChecking') : 'signin',
  authLoading: false,
  authError: '',
  authNotice: '',
  stampRequest: null,
  stampRequestLoading: false,
  stampRequestError: ''
};
const app = document.querySelector('#app');
const t = (key, values = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement), copy[state.lang][key] || key);
const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const applyTheme = (theme, persist = false) => {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('#theme-color')?.setAttribute('content', theme === 'dark' ? '#171612' : '#eecf62');
  if (persist) localStorage.setItem('spirit-theme', theme);
};
const initials = () => `${state.profile.firstName[0] || ''}${state.profile.lastName[0] || ''}`.toUpperCase();
const avatar = (className = 'avatar') => state.profile.photo ? `<span class="${className}"><img src="${state.profile.photo}" alt="${escapeHTML(state.profile.firstName)}"></span>` : `<span class="${className}">${escapeHTML(initials())}</span>`;
const brandLogo = (variant = 'header') => `<img class="brand-logo brand-logo--${variant}" src="assets/spirit-logo-header.png" alt="Spirit">`;

const nav = (active) => `<nav class="bottom-nav" aria-label="${t('navLabel')}">
  ${[['home','home','home'],['rewards','rewards','gift'],['history','history','clock'],['profile','profile','user']].map(([id,label,icon]) => `<button class="nav-item ${active===id?'nav-item--active':''}" data-nav="${id}" aria-label="${t(label)}"><span class="nav-icon">${icons[icon]}</span><span>${t(label)}</span></button>`).join('')}
</nav>`;

const topbar = (withLogout = false) => `<header class="topbar topbar--centered"><div class="brand">${brandLogo('home')}</div>${withLogout ? `<button class="topbar-action" type="button" data-action="logout" aria-label="${t('logout')}">${icons.logout}</button>` : ''}</header>`;

const quickLinks = [
  {name: 'Carta', subtitle: 'viewMenu', icon: 'card', href: 'https://www.canva.com/design/DAFuLPRj4h0/7QGyk7rWcsZD3K84qNLTqA/view?utm_content=DAFuLPRj4h0&utm_campaign=designshare&utm_medium=link&utm_source=editor'},
  {name: 'WhatsApp', subtitle: 'writeUs', icon: 'whatsapp', href: 'https://api.whatsapp.com/send/?phone=34697721877&text&type=phone_number&app_absent=0'},
  {name: 'Instagram', subtitle: 'followUs', icon: 'camera', href: 'https://www.instagram.com/cafeteriaspirit?igsh=MXBwZ3Y0NnhlNDYxag%3D%3D'},
  {name: 'TikTok', subtitle: 'videos', icon: 'tiktok', href: 'https://www.tiktok.com/@spiritcoffee?_t=8mkgPy4coZF&_r=1'},
  {name: 'Google', subtitle: 'leaveReview', icon: 'star', href: 'https://google.com/maps/place//data=!4m3!3m2!1s0x12a4bdafe69b5aed:0x4b27331104bb0ad2!12e1?source=g.page.m.dd._&laa=lu-desktop-reviews-dialog-review-solicitation'},
  {name: 'Just Eat', subtitle: 'delivery', image: 'assets/just-eat-logo.avif', href: 'https://www.just-eat.es/restaurants-spirit-and-coffee-montcada-i-reixac'},
  {name: 'Uber Eats', subtitle: 'delivery', image: 'assets/uber-eats-logo.png', useAsMask: true, href: 'https://www.ubereats.com/es/store/spirit-%26-coffee/S3m66DcHSLCtmmwzHhlp7A?diningMode=DELIVERY'},
];

const quickAccess = () => `<div class="quick-grid">${quickLinks.map((item) => `<a class="quick-card" href="${item.href}" target="_blank" rel="noopener noreferrer" aria-label="${item.name}: ${t(item.subtitle)}"><span class="quick-card__icon ${item.transparentIcon ? 'quick-card__icon--transparent' : ''}">${item.useAsMask ? '<span class="quick-card__uber-mark" aria-hidden="true"></span>' : item.image ? `<img src="${item.image}" alt="" loading="lazy">` : icons[item.icon]}</span><span class="quick-card__copy"><strong>${item.name}</strong><small>${t(item.subtitle)}</small></span></a>`).join('')}</div>`;

function intro() {
  return `<main class="intro-screen" aria-label="${t('introLabel')}">
    <div class="intro-ambient" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="intro-brand"><img class="intro-logo" src="assets/spirit-logo-header.png" alt="Spirit" data-intro-logo><p>Brunch & Specialty Coffee</p></div>
    <button class="intro-skip" type="button" data-action="skip-intro">${t('skip')}</button>
  </main>`;
}

function onboarding() {
  const slides = [
    {title:t('onboarding1Title'), copy:t('onboarding1Copy'), image:'assets/onboarding-coffee.jpg', alt:t('onboarding1Photo')},
    {title:t('onboarding2Title'), copy:t('onboarding2Copy'), image:'assets/onboarding-order.jpg', alt:t('onboarding2Photo')},
    {title:t('onboarding3Title'), copy:t('onboarding3Copy'), image:'assets/onboarding-spirit.jpg', alt:t('onboarding3Photo')}
  ];
  const slide = slides[state.onboarding];
  return `<main class="app-shell onboarding-shell onboarding-shell--${state.onboarding + 1}"><section class="screen screen--onboarding"><header class="onboarding-header">${brandLogo('onboarding')}${state.onboarding < slides.length - 1 ? `<button class="skip" data-action="finish-onboarding">${t('skip')}</button>` : ''}</header><div class="onboarding-stage" data-onboarding-swipe><figure class="onboarding-photo"><img src="${slide.image}" alt="${slide.alt}"><span class="onboarding-photo__shade" aria-hidden="true"></span></figure><article class="onboarding-panel"><p class="eyebrow">Spirit Coffee Club</p><h1>${slide.title}</h1><p class="onboarding-copy">${slide.copy}</p><div class="dots" aria-label="${state.onboarding + 1} de ${slides.length}">${slides.map((_,i)=>`<span class="dot ${i===state.onboarding?'dot--active':''}" ${i===state.onboarding?'aria-current="step"':''}></span>`).join('')}</div><button class="primary-button onboarding-cta" data-action="next-onboarding">${state.onboarding===slides.length-1?t('enter'):t('continue')}</button></article></div></section></main>`;
}

function home() {
  const stamps = Array.from({length:state.loyaltyGoal},(_,i)=>`<span class="stamp ${i<state.stamps?'stamp--earned':''}">${icons.cup}</span>`).join('');
  const remaining = Math.max(0, state.loyaltyGoal - state.stamps);
  const rewardLabel = !state.loyaltyReady ? t('cardUnavailable') : state.availableRewards > 0 ? `${state.availableRewards} ${t('available').toLowerCase()}` : state.rewardDescription;
  const progressLabel = state.loyaltyReady ? t('stampsLeft',{count:remaining}) : t('cardUnavailable');
  const countLabel = state.loyaltyReady ? `${state.stamps}/${state.loyaltyGoal}` : '—';
  const loyaltyAction = state.customerCardId ? 'request-stamp' : 'join-loyalty';
  const loyaltyActionLabel = state.stampRequestLoading ? (state.customerCardId ? t('generatingStamp') : t('joiningClub')) : (state.customerCardId ? t('requestStamp') : t('joinClub'));
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar(true)}<p class="eyebrow">Brunch & specialty coffee</p><h1>${t('hello')}, ${escapeHTML(state.profile.firstName)} ✨<br>${t('coffeeToday')}</h1><article class="loyalty-card"><div class="loyalty-card__top"><div><span class="loyalty-card__label">${t('yourCard')}</span><div class="loyalty-card__count">${countLabel}</div></div><span class="reward-chip">${escapeHTML(rewardLabel)}</span></div><div class="stamps">${stamps}</div><div class="loyalty-card__footer"><div class="progress-copy">${progressLabel}</div><button class="loyalty-card__request" type="button" data-action="${loyaltyAction}" ${state.stampRequestLoading ? 'disabled' : ''}>${loyaltyActionLabel}</button></div></article><div class="section-head"><h2>${t('quickAccess')}</h2></div>${quickAccess()}</section>${nav('home')}</main>`;
}

function rewards() {
  if (!state.loyaltyReady) return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">${t('yourCard')}</p><h1>${t('rewardsTitle')}</h1><div class="empty"><div><div class="empty__icon">☕</div><h2>${t('cardUnavailable')}</h2></div></div></section>${nav('rewards')}</main>`;
  const rewardStatus = state.availableRewards > 0 ? `${state.availableRewards} ${t('available').toLowerCase()}` : t('unavailableReward');
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">${t('rewardsEyebrow',{count:state.stamps})}</p><h1>${t('rewardsTitle')}</h1><p class="subtitle">${t('rewardsCopy')}</p><div class="section-head"><h2>${t('available')}</h2></div><div class="cards"><article class="reward-card"><div class="reward-art">☕</div><div><h3>${escapeHTML(state.rewardDescription)}</h3><p>${t('madeNow')}</p><div class="reward-card__foot"><span class="cost">${state.loyaltyGoal} ${t('stamps')}</span><button class="small-button" type="button" disabled>${escapeHTML(rewardStatus)}</button></div></div></article></div><p class="subtitle">${t('availableAtCafe')}</p></section>${nav('rewards')}</main>`;
}

function history() {
  const formatDate = (value) => new Intl.DateTimeFormat(state.lang === 'ca' ? 'ca-ES' : 'es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const rows = state.loyaltyHistory.map((item) => ({
    title: item.type === 'stamp' ? t('visitStamp') : state.rewardDescription,
    date: `${formatDate(item.createdAt)} · ${item.programName || 'Spirit'} · ${item.businessName || 'Cafetería Spirit'}`,
    points: item.type === 'stamp' ? `+${item.quantity}` : `−${item.quantity}`,
    spent: item.type !== 'stamp'
  }));
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">${t('historyEyebrow')}</p><h1>${t('historyTitle')}</h1><div class="section-head"><h2>${t('movements')}</h2></div>${rows.length===0?`<div class="empty"><div><div class="empty__icon">☕</div><h2>${t('noMovements')}</h2><p>${t('noMovementsCopy')}</p></div></div>`:`<div class="timeline">${rows.map((item)=>`<div class="history-row"><div class="history-row__icon">☕</div><div><div class="history-row__title">${escapeHTML(item.title)}</div><div class="history-row__date">${escapeHTML(item.date)}</div></div><div class="history-row__points ${item.spent?'history-row__points--spent':''}">${item.points}</div></div>`).join('')}</div>${state.loyaltyHistoryHasMore ? '<button class="primary-button history-more" type="button" data-action="load-more-customer-history">Cargar más</button>' : ''}`}</section>${nav('history')}</main>`;
}

function profile() {
  const loyaltyCount = state.loyaltyReady ? `${state.stamps} ${t('stamps')}` : t('cardUnavailable');
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">${t('profileEyebrow')}</p><h1>${t('profileTitle')}</h1>${state.needsProfileCompletion ? '<button class="profile-completion" type="button" data-action="open-personal">Completa tu nombre para personalizar Spirit</button>' : ''}<div class="section-head"><h2>${t('yourAccount')}</h2></div><article class="profile-card">${avatar()}<div><h3>${escapeHTML(state.profile.firstName)} ${escapeHTML(state.profile.lastName)}</h3><p>${escapeHTML(state.profile.email)} · ${loyaltyCount}</p></div></article><div class="section-head"><h2>${t('settings')}</h2></div><div class="settings-list"><button class="settings-row" data-action="open-personal"><span>${t('personalData')}</span><span>›</span></button>${state.hasBusinessAccess ? `<a class="settings-row settings-row--link" href="/cafeteria"><span>${t('businessMode')}</span><span>›</span></a>` : ''}<label class="settings-row settings-row--switch"><span>${t('notifications')}</span><span class="switch"><input type="checkbox" data-notifications ${state.notifications?'checked':''}><span class="switch__track" aria-hidden="true"></span></span></label><label class="settings-row settings-row--switch"><span>${t('darkMode')}</span><span class="switch"><input type="checkbox" data-theme-toggle ${state.theme==='dark'?'checked':''}><span class="switch__track" aria-hidden="true"></span></span></label><button class="settings-row" data-action="open-language"><span>${t('language')}</span><small>${state.lang==='ca'?t('catalan'):t('spanish')}</small></button><button class="settings-row" data-action="share"><span>${t('inviteFriend')}</span><span>›</span></button><button class="settings-row settings-row--danger" data-action="logout"><span>${t('logout')}</span><span>›</span></button></div><div class="section-head"><h2>Spirit Coffee</h2></div><p class="subtitle">Passeig Rocamora, 9<br>Montcada i Reixac · Barcelona</p></section>${nav('profile')}</main>`;
}

function login() {
  const message = `<p class="form-notice" role="status">${escapeHTML(state.authNotice)}</p><p class="form-error" role="alert">${escapeHTML(state.authError)}</p>`;
  const recoveryMode = ['recoveryChecking', 'recovery', 'recoveryError', 'recoverySuccess'].includes(state.authMode);
  let form;
  if (state.authMode === 'forgot') {
    form = `<form class="form" data-form="customer-forgot"><div class="field"><label for="forgot-email">${t('email')}</label><input id="forgot-email" name="email" type="email" autocomplete="email" inputmode="email" required></div>${message}<button class="primary-button" type="submit" ${state.authLoading ? 'disabled' : ''}>${state.authLoading ? t('checkSession') : t('sendRecovery')}</button><button class="auth-link" type="button" data-action="auth-signin">${t('backToSignIn')}</button></form>`;
  } else if (state.authMode === 'recoveryChecking') {
    form = `<div class="form recovery-state" role="status"><span class="auth-spinner" aria-hidden="true"></span><p>${t('recoveryChecking')}</p></div>`;
  } else if (state.authMode === 'recoveryError') {
    form = `<div class="form recovery-state recovery-state--error"><span class="recovery-state__icon" aria-hidden="true">!</span><h2>${t('recoveryInvalidTitle')}</h2><p>${t('recoveryInvalidCopy')}</p>${message}<button class="primary-button" type="button" data-action="recovery-request">${t('requestAnotherRecovery')}</button><button class="auth-link auth-link--centered" type="button" data-action="auth-signin">${t('backToSignIn')}</button></div>`;
  } else if (state.authMode === 'recoverySuccess') {
    form = `<div class="form recovery-state recovery-state--success"><span class="recovery-state__icon" aria-hidden="true">✓</span><h2>${t('recoveryCompleteTitle')}</h2><p>${t('recoveryCompleteCopy')}</p><button class="primary-button" type="button" data-action="recovery-continue">${t('continueToSpirit')}</button></div>`;
  } else if (state.authMode === 'recovery') {
    form = `<form class="form" data-form="customer-recovery"><div class="field"><label for="recovery-password">${t('newPassword')}</label><input id="recovery-password" name="password" type="password" minlength="8" autocomplete="new-password" aria-describedby="recovery-password-note" required><small id="recovery-password-note" class="field-note">${t('passwordLength')}</small></div><div class="field"><label for="recovery-confirmation">${t('repeatPassword')}</label><input id="recovery-confirmation" name="confirmation" type="password" minlength="8" autocomplete="new-password" required></div>${message}<button class="primary-button" type="submit" ${state.authLoading ? 'disabled' : ''}>${state.authLoading ? t('checkSession') : t('completeRecovery')}</button></form>`;
  } else {
    const signingUp = state.authMode === 'signup';
    form = `<div class="auth-switch" role="group" aria-label="Autenticación"><button type="button" class="${!signingUp ? 'auth-switch--active' : ''}" data-action="auth-signin">${t('signIn')}</button><button type="button" class="${signingUp ? 'auth-switch--active' : ''}" data-action="auth-signup">${t('createAccount')}</button></div><div class="oauth-actions"><button type="button" data-oauth-provider="google">G <span>${t('oauthGoogle')}</span></button><button type="button" data-oauth-provider="apple">● <span>${t('oauthApple')}</span></button></div><div class="auth-divider"><span>o</span></div><form class="form" data-form="customer-auth" data-auth-mode="${signingUp ? 'signup' : 'signin'}">${signingUp ? `<div class="field"><label for="name">${t('firstName')}</label><input id="name" name="name" maxlength="80" autocomplete="name" placeholder="${t('namePlaceholder')}" required></div>` : ''}<div class="field"><label for="email">${t('email')}</label><input id="email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="tu@email.com" required></div><div class="field"><label for="password">${t('password')}</label><input id="password" name="password" type="password" minlength="8" autocomplete="${signingUp ? 'new-password' : 'current-password'}" required></div>${signingUp ? `<label class="check"><input type="checkbox" required><span>${t('privacy')}</span></label>` : `<button class="auth-link" type="button" data-action="auth-forgot">${t('forgotPassword')}</button>`}${message}<button class="primary-button" type="submit" ${state.authLoading ? 'disabled' : ''}>${state.authLoading ? t('checkSession') : signingUp ? t('createAccount') : t('signIn')}</button></form>`;
  }
  return `<main class="app-shell"><section class="screen screen--gold ${recoveryMode ? 'screen--recovery' : ''}">${topbar()}<p class="eyebrow">${t(recoveryMode ? 'recoveryEyebrow' : 'welcome')}</p><h1>${t(recoveryMode ? 'recoveryTitle' : 'loginTitle')}</h1>${recoveryMode && state.authMode === 'recovery' ? `<p class="subtitle recovery-intro">${t('recoveryCopy')}</p>` : ''}${form}</section></main>`;
}

function authLoading() {
  return `<main class="app-shell"><section class="screen screen--gold auth-loading">${topbar()}<span class="auth-spinner" aria-hidden="true"></span><p>${t('checkSession')}</p></section></main>`;
}

const sheet = (content, className = '') => `<div class="modal-backdrop" data-sheet-backdrop><div class="modal ${className}" role="dialog" aria-modal="true">${content}</div></div>`;
function stampRequestSheet() {
  const request = state.stampRequest;
  if (request?.expired) {
    return sheet(`<div data-stamp-request-sheet><div class="sheet-head"><div><p class="eyebrow">Spirit Coffee Club</p><h2>${t('stampRequestTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-stamp-request" aria-label="${t('close')}">×</button></div><div class="stamp-request stamp-request--expired"><span class="stamp-request__expired-icon" aria-hidden="true">⌛</span><p>${t('stampExpired')}</p><button class="primary-button" type="button" data-action="regenerate-stamp">${t('regenerateStamp')}</button></div></div>`, 'modal--form modal--stamp-request');
  }
  return sheet(`<div data-stamp-request-sheet><div class="sheet-head"><div><p class="eyebrow">Spirit Coffee Club</p><h2>${t('stampRequestTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-stamp-request" aria-label="${t('close')}">×</button></div><div class="stamp-request"><p class="subtitle">${t('stampRequestCopy')}</p><div class="stamp-request__qr"><img src="${request.qrDataUrl}" alt="QR temporal para solicitar un sello"></div><span class="stamp-request__label">${t('stampCodeLabel')}</span><strong class="stamp-request__code">${escapeHTML(request.shortCode)}</strong><p class="stamp-request__countdown" role="timer" aria-live="polite">${t('stampExpiresIn',{count:'<span data-stamp-countdown>60</span>'})}</p><p class="stamp-request__security">El código se valida de forma segura y no contiene datos personales.</p></div></div>`, 'modal--form modal--stamp-request');
}

let stampCountdownTimer = 0;
let stampPollingTimer = 0;
let stampFallbackTimer = 0;
let stopStampRealtime = null;
let stampReconcileBusy = false;

function applyCustomerCard(card) {
  state.loyaltyReady = true;
  state.customerCardId = card.id;
  state.stamps = card.currentStamps;
  state.availableRewards = card.availableRewards;
  state.loyaltyGoal = card.stampsRequired;
  state.rewardDescription = card.rewardDescription;
}

async function refreshCustomerLoyalty({ includeHistory = true, repaint = false } = {}) {
  const card = await getOwnCustomerCard();
  applyCustomerCard(card);
  if (includeHistory) {
    state.loyaltyHistory = await getOwnStampHistory(card.id);
    state.loyaltyHistoryHasMore = state.loyaltyHistory.length === 20;
  }
  if (repaint && ['home', 'rewards', 'history', 'profile'].includes(state.screen)) render();
  return card;
}

async function refreshCustomerLoyaltySafely(options) {
  try {
    return await refreshCustomerLoyalty(options);
  } catch (error) {
    state.stampRequestError = error instanceof StampSessionError ? error.message : readableAuthError(error);
    return null;
  }
}

function stopStampMonitoring() {
  clearTimeout(stampFallbackTimer);
  clearInterval(stampPollingTimer);
  stampFallbackTimer = 0;
  stampPollingTimer = 0;
  stopStampRealtime?.();
  stopStampRealtime = null;
  stampReconcileBusy = false;
}

async function reconcileConfirmedStamp() {
  const request = state.stampRequest;
  if (!request?.customerCardId || request.expired || stampReconcileBusy) return;
  stampReconcileBusy = true;
  try {
    const card = await getOwnCustomerCard();
    const changed = hasLoyaltyBalanceChanged(request, card);
    if (!changed) return;
    const rewardDelta = earnedRewardDelta(request, card);
    applyCustomerCard(card);
    state.loyaltyHistory = await getOwnStampHistory(card.id);
    state.loyaltyHistoryHasMore = state.loyaltyHistory.length === 20;
    clearStampRequest();
    render();
    showToast(rewardDelta > 0 ? t('rewardWon', { count: rewardDelta }) : t('stampConfirmed'));
  } catch {
    // El siguiente evento o ciclo de polling vuelve a consultar la fuente de verdad.
  } finally {
    stampReconcileBusy = false;
  }
}

function startStampPolling() {
  if (stampPollingTimer || !state.stampRequest?.customerCardId) return;
  stampPollingTimer = setInterval(reconcileConfirmedStamp, 5000);
  reconcileConfirmedStamp();
}

function startStampMonitoring(request) {
  stopStampMonitoring();
  stopStampRealtime = subscribeToOwnStampTransactions(request.customerCardId, {
    onInsert: reconcileConfirmedStamp,
    onStatus: (status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(stampFallbackTimer);
        stampFallbackTimer = 0;
      } else if (shouldStartPolling(status)) {
        startStampPolling();
      }
    }
  });
  stampFallbackTimer = setTimeout(startStampPolling, 8000);
}

function clearStampRequest(removeSheet = true) {
  stopStampMonitoring();
  clearInterval(stampCountdownTimer);
  stampCountdownTimer = 0;
  state.stampRequest = null;
  state.stampRequestError = '';
  if (removeSheet) document.querySelector('[data-sheet-backdrop]')?.remove();
}

function expireStampRequest() {
  stopStampMonitoring();
  clearInterval(stampCountdownTimer);
  stampCountdownTimer = 0;
  state.stampRequest = { expired: true };
  document.querySelector('[data-sheet-backdrop]')?.remove();
  openSheet(stampRequestSheet());
}

function startStampCountdown() {
  clearInterval(stampCountdownTimer);
  const update = () => {
    if (!state.stampRequest?.expiresAt) return;
    const remaining = Math.max(0, Math.ceil((new Date(state.stampRequest.expiresAt).getTime() - Date.now()) / 1000));
    const counter = document.querySelector('[data-stamp-countdown]');
    if (counter) counter.textContent = String(remaining);
    if (remaining <= 0) expireStampRequest();
  };
  update();
  stampCountdownTimer = setInterval(update, 250);
}

async function openStampRequest() {
  if (state.stampRequestLoading) return;
  clearStampRequest();
  state.stampRequestLoading = true;
  render();
  try {
    const request = await createStampRequest();
    state.stampRequest = request;
    state.stampRequestLoading = false;
    render();
    if (state.screen === 'home') {
      openSheet(stampRequestSheet());
      startStampCountdown();
      startStampMonitoring(request);
    } else {
      clearStampRequest(false);
    }
  } catch (error) {
    state.stampRequestLoading = false;
    state.stampRequestError = error instanceof StampSessionError ? error.message : readableAuthError(error);
    render();
    showToast(state.stampRequestError);
  }
}

function personalSheet() {
  return sheet(`<div class="sheet-head"><div><p class="eyebrow">${t('personalEyebrow')}</p><h2>${t('personalTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div><form class="sheet-form" data-form="profile"><div class="photo-editor">${avatar('avatar avatar--editor')}<strong>${t('changePhoto')}</strong><div class="photo-actions"><label class="photo-action">${t('gallery')}<input type="file" accept="image/*" data-photo-input hidden></label><label class="photo-action">${t('camera')}<input type="file" accept="image/*" capture="environment" data-photo-input hidden></label></div></div><div class="field"><label for="profile-first">${t('firstName')}</label><input id="profile-first" name="firstName" value="${escapeHTML(state.profile.firstName)}" maxlength="28" autocomplete="given-name" required></div><div class="field"><label for="profile-last">${t('lastName')}</label><input id="profile-last" name="lastName" value="${escapeHTML(state.profile.lastName)}" maxlength="42" autocomplete="family-name" required></div><div class="field"><label for="profile-email">${t('email')}</label><input id="profile-email" value="${escapeHTML(state.profile.email)}" type="email" readonly aria-describedby="email-note"><small id="email-note" class="field-note">${t('emailReadOnly')}</small></div><button class="sheet-link" type="button" data-action="open-password"><span>${t('changePassword')}</span><span>›</span></button><button class="primary-button" type="submit">${t('save')}</button></form>`, 'modal--form');
}

function languageSheet() {
  return sheet(`<div class="sheet-head"><div><p class="eyebrow">${t('languageEyebrow')}</p><h2>${t('languageTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div><div class="language-options"><button class="language-option ${state.lang==='es'?'language-option--active':''}" data-language="es"><span>${t('spanish')}</span><span>${state.lang==='es'?'✓':''}</span></button><button class="language-option ${state.lang==='ca'?'language-option--active':''}" data-language="ca"><span>${t('catalan')}</span><span>${state.lang==='ca'?'✓':''}</span></button></div>`, 'modal--form');
}

function passwordSheet() {
  return sheet(`<div class="sheet-head"><div><p class="eyebrow">${t('passwordEyebrow')}</p><h2>${t('passwordTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div><form class="sheet-form" data-form="password"><div class="field"><label for="current-password">${t('currentPassword')}</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="new-password">${t('newPassword')}</label><input id="new-password" name="newPassword" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label for="confirm-password">${t('confirmPassword')}</label><input id="confirm-password" name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></div><p class="form-error" data-password-error role="alert"></p><button class="primary-button" type="submit">${t('save')}</button></form>`, 'modal--form');
}

const readableAuthError = (error) => {
  const messages = {
    invalid_credentials: 'El correo o la contraseña no son correctos.',
    email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
    user_already_exists: 'Ya existe una cuenta con este correo.',
    weak_password: 'La contraseña no cumple los requisitos de seguridad.',
    over_request_rate_limit: 'Demasiados intentos. Espera unos minutos antes de volver a probar.',
    network_error: 'No se ha podido conectar con Spirit. Revisa tu conexión.',
    session_not_found: t('recoverySessionMissing'),
    otp_expired: t('recoverySessionMissing'),
    access_denied: t('recoverySessionMissing')
  };
  return messages[error?.code] || error?.message || 'No se ha podido completar la operación.';
};

function applyCustomerContext(context) {
  if (!context) return;
  state.profile = {
    ...defaultProfile,
    firstName: context.firstName,
    lastName: context.lastName,
    email: context.email
  };
  state.hasBusinessAccess = Boolean(context.hasBusinessAccess);
  state.needsProfileCompletion = Boolean(context.needsProfileCompletion);
  state.authStatus = 'authenticated';
  state.afterIntro = 'home';
  localStorage.setItem('spirit-seen', '1');
}

function clearCustomerIdentity() {
  stopStampMonitoring();
  localStorage.removeItem('spirit-seen');
  state.profile = { ...defaultProfile };
  state.hasBusinessAccess = false;
  state.needsProfileCompletion = false;
  state.authStatus = 'unauthenticated';
  state.authMode = 'signin';
  state.authError = '';
  state.authNotice = '';
  state.stamps = 0;
  state.availableRewards = 0;
  state.loyaltyGoal = 0;
  state.rewardDescription = '';
  state.loyaltyReady = false;
  state.customerCardId = null;
  state.loyaltyHistory = [];
  state.loyaltyHistoryHasMore = false;
}

async function initializeCustomerAuth() {
  try {
    const user = await getCurrentUser();
    if (isPasswordRecoveryRoute) {
      if (recoveryLinkError) {
        state.authStatus = 'unauthenticated';
        state.authMode = 'recoveryError';
      } else if (user) {
        state.authStatus = 'authenticated';
        if (state.authMode === 'recoveryChecking') state.authMode = 'recovery';
      } else {
        state.authStatus = 'unauthenticated';
        state.authMode = 'recoveryError';
        state.authError = t('recoverySessionMissing');
      }
      state.screen = 'login';
      render();
      return;
    }
    const context = user ? await getCustomerContext(user) : null;
    if (context) {
      applyCustomerContext(context);
      await refreshCustomerLoyaltySafely();
      if (isOAuthCallbackRoute) window.history.replaceState({}, '', '/');
    }
    else state.authStatus = 'unauthenticated';
  } catch (error) {
    state.authStatus = 'error';
    state.authError = readableAuthError(error);
  }
  if (state.screen === 'authLoading') {
    state.screen = state.authStatus === 'authenticated' ? 'home' : 'login';
    render();
  }
}

function finishIntro() {
  if (state.screen !== 'intro') return;
  state.screen = state.authStatus === 'checking' ? 'authLoading' : state.afterIntro;
  render();
}

let onboardingTransitioning = false;
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fadeOutOnboarding() {
  const stage = document.querySelector('.onboarding-stage');
  if (!stage) return;
  document.querySelector('.skip')?.setAttribute('disabled', '');
  stage.classList.add('onboarding-stage--leaving');
  await wait(230);
}

async function moveOnboarding(step) {
  const next = state.onboarding + step;
  if (next < 0 || next > 2 || onboardingTransitioning) return;
  onboardingTransitioning = true;
  await fadeOutOnboarding();
  state.onboarding = next;
  render();
  await wait(230);
  onboardingTransitioning = false;
}

async function enterSpirit() {
  if (onboardingTransitioning) return;
  onboardingTransitioning = true;
  await fadeOutOnboarding();
  localStorage.setItem('spirit-onboarded', '1');
  state.screen = 'login';
  render();
  onboardingTransitioning = false;
}

async function logout() {
  clearStampRequest();
  try { await signOut(); }
  catch (error) { showToast(readableAuthError(error)); }
  clearCustomerIdentity();
  localStorage.setItem('spirit-onboarded', '1');
  state.onboarding = 0;
  state.screen = 'login';
  render();
  scrollTo(0, 0);
}

function render() {
  document.documentElement.lang = state.lang;
  app.innerHTML = ({intro,onboarding,login,authLoading,home,rewards,history,profile})[state.screen]();
  bind();
  if (state.screen === 'intro') {
    document.querySelector('[data-intro-logo]')?.addEventListener('error', finishIntro, {once: true});
    clearTimeout(render.introFallback);
    render.introFallback = setTimeout(finishIntro, 2600);
  }
}
function showToast(message) { const toast=document.querySelector('#toast'); toast.textContent=message; toast.classList.add('toast--show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove('toast--show'),2200); }

function openSheet(markup) {
  document.querySelector('[data-sheet-backdrop]')?.remove();
  app.insertAdjacentHTML('beforeend', markup);
  bind();
  document.querySelector('.modal input:not([type="file"]), .modal button')?.focus();
}

async function imageToAvatar(file) {
  if (!file?.type.startsWith('image/')) throw new Error('Invalid image');
  const image = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => { URL.revokeObjectURL(url); resolve(element); };
    element.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Invalid image')); };
    element.src = url;
  });
  const size = 512;
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', .86);
}

async function shareSpirit() {
  const data = { title: 'Spirit Coffee', text: t('shareText'), url: location.href };
  const copyFallback = async () => {
    const value = `${data.text} ${data.url}`;
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast(t('shareCopied'));
  };
  try {
    if (navigator.share) await navigator.share(data);
    else await copyFallback();
  } catch (error) {
    if (error.name !== 'AbortError') await copyFallback();
  }
}

function bind() {
  document.querySelectorAll('[data-nav]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{clearStampRequest();state.screen=el.dataset.nav; render(); scrollTo(0,0);})});
  document.querySelectorAll('[data-action]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',async()=>{
    const action=el.dataset.action;
    if(action==='skip-intro'){ clearTimeout(render.introFallback); finishIntro(); }
    if(action==='next-onboarding'){ if(state.onboarding<2) moveOnboarding(1); else enterSpirit(); }
    if(action==='finish-onboarding' && !onboardingTransitioning){ localStorage.setItem('spirit-onboarded','1'); state.screen='login'; render(); }
    if(action==='close-sheet'){ document.querySelector('[data-sheet-backdrop]')?.remove(); }
    if(action==='request-stamp'){ openStampRequest(); }
    if(action==='join-loyalty'){
      if(state.stampRequestLoading)return;
      state.stampRequestLoading=true;state.stampRequestError='';render();
      try{const card=await createOwnCustomerMembership();applyCustomerCard(card);state.loyaltyHistory=await getOwnStampHistory(card.id);state.loyaltyHistoryHasMore=state.loyaltyHistory.length===20;}
      catch(error){state.stampRequestError=error instanceof StampSessionError?error.message:readableAuthError(error);showToast(state.stampRequestError);}
      finally{state.stampRequestLoading=false;render();}
    }
    if(action==='load-more-customer-history'){
      const before=state.loyaltyHistory.at(-1)?.createdAt;
      if(!before||!state.customerCardId)return;
      try{const rows=await getOwnStampHistory(state.customerCardId,20,before);state.loyaltyHistory=[...state.loyaltyHistory,...rows];state.loyaltyHistoryHasMore=rows.length===20;}
      catch(error){showToast(readableAuthError(error));}
      render();
    }
    if(action==='close-stamp-request'){ clearStampRequest(); }
    if(action==='regenerate-stamp'){ clearStampRequest(); openStampRequest(); }
    if(action==='open-personal'){ openSheet(personalSheet()); }
    if(action==='open-language'){ openSheet(languageSheet()); }
    if(action==='open-password'){ openSheet(passwordSheet()); }
    if(action==='share'){ shareSpirit(); }
    if(action==='auth-signin'){ if(isPasswordRecoveryRoute)window.history.replaceState({},'', '/'); state.authMode='signin'; state.authError=''; state.authNotice=''; render(); }
    if(action==='auth-signup'){ state.authMode='signup'; state.authError=''; state.authNotice=''; render(); }
    if(action==='auth-forgot'){ state.authMode='forgot'; state.authError=''; state.authNotice=''; render(); }
    if(action==='recovery-request'){ window.history.replaceState({},'', '/'); state.authMode='forgot'; state.authError=''; state.authNotice=''; render(); }
    if(action==='recovery-continue'){ window.history.replaceState({},'', '/'); state.authMode='signin'; state.screen='home'; render(); scrollTo(0,0); }
    if(action==='logout'){ await logout(); }
  })});
  document.querySelectorAll('[data-sheet-backdrop]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',(event)=>{if(event.target===el){if(el.querySelector('[data-stamp-request-sheet]'))clearStampRequest();else el.remove();}})});
  document.querySelectorAll('[data-onboarding-swipe]:not([data-bound])').forEach(el=>{el.dataset.bound='1';let startX=0;let startY=0;el.addEventListener('touchstart',(event)=>{startX=event.changedTouches[0].clientX;startY=event.changedTouches[0].clientY;},{passive:true});el.addEventListener('touchend',(event)=>{const deltaX=event.changedTouches[0].clientX-startX;const deltaY=event.changedTouches[0].clientY-startY;if(Math.abs(deltaX)>52&&Math.abs(deltaX)>Math.abs(deltaY)*1.2)moveOnboarding(deltaX<0?1:-1);},{passive:true})});
  document.querySelectorAll('[data-language]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{state.lang=el.dataset.language;localStorage.setItem('spirit-language',state.lang);document.querySelector('[data-sheet-backdrop]')?.remove();render();})});
  document.querySelectorAll('[data-notifications]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('change',(event)=>{state.notifications=event.currentTarget.checked;localStorage.setItem('spirit-notifications',String(state.notifications));})});
  document.querySelectorAll('[data-theme-toggle]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('change',(event)=>applyTheme(event.currentTarget.checked?'dark':'light',true))});
  document.querySelectorAll('[data-photo-input]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('change',async(event)=>{try{state.profile.photo=await imageToAvatar(event.currentTarget.files[0]);document.querySelectorAll('.avatar').forEach(avatarElement=>{avatarElement.innerHTML=`<img src="${state.profile.photo}" alt="${escapeHTML(state.profile.firstName)}">`;});}catch{showToast(t('invalidImage'));}event.currentTarget.value='';})});
  document.querySelectorAll('[data-oauth-provider]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',async()=>{if(state.authLoading)return;state.authLoading=true;state.authError='';render();try{await signInCustomerWithOAuth(el.dataset.oauthProvider);}catch(error){state.authLoading=false;state.authError=readableAuthError(error);render();}})});
  document.querySelector('[data-form="customer-auth"]')?.addEventListener('submit',async(e)=>{e.preventDefault();if(state.authLoading)return;const form=e.currentTarget;const data=new FormData(form);state.authLoading=true;state.authError='';state.authNotice='';render();try{if(form.dataset.authMode==='signup'){const result=await signUpCustomer({email:data.get('email'),password:data.get('password'),displayName:data.get('name')});if(result.confirmationRequired){state.authMode='signin';state.authNotice=t('authConfirmation');state.screen='login';}else{applyCustomerContext(result.context);await refreshCustomerLoyaltySafely();state.screen='home';}}else{applyCustomerContext(await signInCustomer(data.get('email'),data.get('password')));await refreshCustomerLoyaltySafely();state.screen='home';}}catch(error){state.authError=readableAuthError(error);state.screen='login';}finally{state.authLoading=false;render();}});
  document.querySelector('[data-form="customer-forgot"]')?.addEventListener('submit',async(e)=>{e.preventDefault();if(state.authLoading)return;const data=new FormData(e.currentTarget);state.authLoading=true;state.authError='';state.authNotice='';render();try{await requestCustomerPasswordReset(data.get('email'));state.authNotice=t('recoverySent');state.authMode='signin';}catch(error){state.authError=readableAuthError(error);}finally{state.authLoading=false;state.screen='login';render();}});
  document.querySelector('[data-form="customer-recovery"]')?.addEventListener('submit',async(e)=>{e.preventDefault();if(state.authLoading)return;const data=new FormData(e.currentTarget);const password=String(data.get('password')||'');const confirmation=String(data.get('confirmation')||'');if(password.length<8){state.authError=t('passwordLength');render();return;}if(password!==confirmation){state.authError=t('passwordMismatch');render();return;}state.authLoading=true;state.authError='';render();try{await completeCustomerPasswordRecovery(password);const context=await getCustomerContext();if(!context)throw Object.assign(new Error(t('recoverySessionMissing')),{code:'session_not_found'});applyCustomerContext(context);await refreshCustomerLoyaltySafely();window.history.replaceState({},'', '/');state.authMode='recoverySuccess';state.screen='login';}catch(error){state.authError=readableAuthError(error);if(['session_not_found','otp_expired','access_denied'].includes(error?.code))state.authMode='recoveryError';}finally{state.authLoading=false;render();}});
  document.querySelector('[data-form="profile"]')?.addEventListener('submit',async(e)=>{e.preventDefault();const data=new FormData(e.currentTarget);try{const context=await updateCustomerProfile(`${data.get('firstName')} ${data.get('lastName')}`);applyCustomerContext(context);document.querySelector('[data-sheet-backdrop]')?.remove();render();}catch(error){showToast(readableAuthError(error));}});
  document.querySelector('[data-form="password"]')?.addEventListener('submit',async(e)=>{e.preventDefault();const data=new FormData(e.currentTarget);const current=data.get('currentPassword');const next=data.get('newPassword');const confirmation=data.get('confirmPassword');const error=e.currentTarget.querySelector('[data-password-error]');error.textContent='';if(next.length<8){error.textContent=t('passwordLength');return;}if(next!==confirmation){error.textContent=t('passwordMismatch');return;}try{await updateCustomerPassword(state.profile.email,current,next);document.querySelector('[data-sheet-backdrop]')?.remove();showToast(t('passwordSaved'));}catch(authError){error.textContent=readableAuthError(authError);}});
}

if (!isBusinessMode) {
  render();
  initializeCustomerAuth();
  try {
    subscribeToAuthChanges(async(event, user) => {
      if (event === 'PASSWORD_RECOVERY') {
        state.authStatus = 'authenticated';
        state.authMode = 'recovery';
        state.authError = '';
        state.screen = 'login';
        render();
        return;
      }
      if (event === 'SIGNED_OUT') {
        clearStampRequest();
        clearCustomerIdentity();
        if (!['intro', 'onboarding'].includes(state.screen)) state.screen = 'login';
        render();
        return;
      }
      if (event === 'SIGNED_IN' && user && state.authStatus !== 'authenticated') {
        if (isPasswordRecoveryRoute && ['recoveryChecking', 'recovery'].includes(state.authMode)) {
          state.authStatus = 'authenticated';
          state.authMode = 'recovery';
          state.screen = 'login';
          render();
          return;
        }
        try {
          applyCustomerContext(await getCustomerContext(user));
          await refreshCustomerLoyaltySafely();
          if (state.screen === 'login') state.screen = 'home';
          render();
        } catch (error) {
          state.authError = readableAuthError(error);
          render();
        }
      }
    });
  } catch (error) {
    state.authStatus = 'error';
    state.authError = readableAuthError(error);
  }
}

if (!localStorage.getItem('spirit-theme')) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => applyTheme(event.matches ? 'dark' : 'light'));
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

addEventListener('pagehide', () => clearStampRequest(false));
