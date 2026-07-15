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

const savedProfile = (() => {
  try { return JSON.parse(localStorage.getItem('spirit-profile')) || {}; }
  catch { return {}; }
})();

const copy = {
  es: {
    navLabel: 'Navegación principal', home: 'Inicio', rewards: 'Premios', history: 'Historial', profile: 'Perfil', skip: 'Omitir', continue: 'Continuar', enter: 'Entrar en Spirit',
    introLabel: 'Introducción automática de Cafetería Spirit.', onboarding1Title: 'Cada café suma', onboarding1Copy: 'Guarda tus sellos sin tarjetas de papel. Cada visita te acerca a tu próximo café.', onboarding2Title: 'Tus recompensas, a un toque', onboarding2Copy: 'Consulta lo que tienes disponible y canjéalo directamente en la cafetería.', onboarding3Title: 'Todo Spirit en un solo sitio', onboarding3Copy: 'La carta, tus pedidos y nuestras redes siempre a mano.',
    hello: 'Hola', coffeeToday: 'Hoy toca café.', yourCard: 'Tu tarjeta Spirit', freeCoffee: 'Café gratis', stampsLeft: 'Te quedan {count} sellos para tu café gratis', quickAccess: 'Accesos rápidos', viewMenu: 'Ver menú', writeUs: 'Escríbenos', followUs: 'Síguenos', videos: 'Vídeos', leaveReview: 'Déjanos una reseña', delivery: 'Pedir a domicilio',
    rewardsEyebrow: 'Tienes {count} sellos', rewardsTitle: 'Algo bueno<br>te espera.', rewardsCopy: 'Canjea tus sellos en caja y disfruta de tu momento Spirit.', available: 'Disponibles', specialtyCoffee: 'Café de especialidad', artisanCookie: 'Cookie artesana', spiritBrunch: 'Brunch Spirit', madeNow: 'Preparado al momento con mucho mimo.', stamps: 'sellos', missingStamps: 'Te faltan sellos', redeem: 'Canjear',
    historyEyebrow: 'Tus momentos Spirit', historyTitle: 'Cada visita<br>cuenta.', movements: 'Movimientos', viewHistory: 'Ver historial', viewEmpty: 'Ver vacío', visitStamp: 'Sello por visita', today: 'Hoy', noMovements: 'Aún no hay movimientos', noMovementsCopy: '¡Ven a por tu primer sello! Tu historia Spirit empieza con un café.',
    profileEyebrow: 'Tu espacio', profileTitle: 'Muy tú.<br>Muy Spirit.', yourAccount: 'Tu cuenta', settings: 'Ajustes', personalData: 'Datos personales', notifications: 'Notificaciones', darkMode: 'Modo oscuro', language: 'Idioma', spanish: 'Castellano', catalan: 'Catalán', inviteFriend: 'Invita a un amigo', logout: 'Cerrar sesión',
    personalEyebrow: 'Tu cuenta', personalTitle: 'Datos personales', changePhoto: 'Fotografía de perfil', gallery: 'Galería', camera: 'Cámara', firstName: 'Nombre', lastName: 'Apellidos', email: 'Correo electrónico', emailReadOnly: 'Gestionado por tu cuenta', changePassword: 'Cambiar contraseña', save: 'Guardar', close: 'Cerrar',
    passwordEyebrow: 'Seguridad', passwordTitle: 'Cambiar contraseña', currentPassword: 'Contraseña actual', newPassword: 'Nueva contraseña', confirmPassword: 'Confirmar contraseña', passwordLength: 'La nueva contraseña debe tener al menos 8 caracteres.', passwordMismatch: 'Las contraseñas no coinciden.', passwordIncorrect: 'La contraseña actual no es correcta.', passwordSaved: 'Contraseña actualizada',
    languageEyebrow: 'Preferencias', languageTitle: 'Idioma de la aplicación', welcome: 'Bienvenida a casa', loginTitle: 'Tu café.<br>Tus sellos.', phone: 'Teléfono', namePlaceholder: '¿Cómo te llamas?', privacy: 'Acepto la política de privacidad y el tratamiento de mis datos según el RGPD.', createAccount: 'Crear mi cuenta',
    redeemReady: 'Listo para canjear', redeemCopy: 'Enseña este código al equipo de Spirit. Caduca en 10 minutos.', confirmAtCafe: 'Confirmar en caja', enjoy: '¡Disfrútalo! Nos vemos pronto en Spirit ☕', shareText: 'Descubre Cafetería Spirit · Brunch and Specialty Coffee Montcada', shareCopied: 'Enlace copiado para compartir', invalidImage: 'No se ha podido procesar la imagen.'
  },
  ca: {
    navLabel: 'Navegació principal', home: 'Inici', rewards: 'Premis', history: 'Historial', profile: 'Perfil', skip: 'Omet', continue: 'Continuar', enter: 'Entrar a Spirit',
    introLabel: 'Introducció automàtica de Cafeteria Spirit.', onboarding1Title: 'Cada cafè suma', onboarding1Copy: 'Guarda els teus segells sense targetes de paper. Cada visita t’acosta al teu pròxim cafè.', onboarding2Title: 'Les teves recompenses, a un toc', onboarding2Copy: 'Consulta què tens disponible i bescanvia-ho directament a la cafeteria.', onboarding3Title: 'Tot Spirit en un sol lloc', onboarding3Copy: 'La carta, les teves comandes i les nostres xarxes sempre a mà.',
    hello: 'Hola', coffeeToday: 'Avui toca cafè.', yourCard: 'La teva targeta Spirit', freeCoffee: 'Cafè gratis', stampsLeft: 'Et queden {count} segells per al teu cafè gratis', quickAccess: 'Accessos ràpids', viewMenu: 'Veure menú', writeUs: 'Escriu-nos', followUs: 'Segueix-nos', videos: 'Vídeos', leaveReview: 'Deixa’ns una ressenya', delivery: 'Demanar a domicili',
    rewardsEyebrow: 'Tens {count} segells', rewardsTitle: 'Una cosa bona<br>t’espera.', rewardsCopy: 'Bescanvia els teus segells a caixa i gaudeix del teu moment Spirit.', available: 'Disponibles', specialtyCoffee: 'Cafè d’especialitat', artisanCookie: 'Cookie artesana', spiritBrunch: 'Brunch Spirit', madeNow: 'Preparat al moment amb molta cura.', stamps: 'segells', missingStamps: 'Et falten segells', redeem: 'Bescanviar',
    historyEyebrow: 'Els teus moments Spirit', historyTitle: 'Cada visita<br>compta.', movements: 'Moviments', viewHistory: 'Veure historial', viewEmpty: 'Veure buit', visitStamp: 'Segell per visita', today: 'Avui', noMovements: 'Encara no hi ha moviments', noMovementsCopy: 'Vine a buscar el teu primer segell! La teva història Spirit comença amb un cafè.',
    profileEyebrow: 'El teu espai', profileTitle: 'Molt tu.<br>Molt Spirit.', yourAccount: 'El teu compte', settings: 'Configuració', personalData: 'Dades personals', notifications: 'Notificacions', darkMode: 'Mode fosc', language: 'Idioma', spanish: 'Castellà', catalan: 'Català', inviteFriend: 'Convida un amic', logout: 'Tancar sessió',
    personalEyebrow: 'El teu compte', personalTitle: 'Dades personals', changePhoto: 'Fotografia de perfil', gallery: 'Galeria', camera: 'Càmera', firstName: 'Nom', lastName: 'Cognoms', email: 'Correu electrònic', emailReadOnly: 'Gestionat pel teu compte', changePassword: 'Canviar contrasenya', save: 'Desar', close: 'Tancar',
    passwordEyebrow: 'Seguretat', passwordTitle: 'Canviar contrasenya', currentPassword: 'Contrasenya actual', newPassword: 'Nova contrasenya', confirmPassword: 'Confirmar contrasenya', passwordLength: 'La nova contrasenya ha de tenir almenys 8 caràcters.', passwordMismatch: 'Les contrasenyes no coincideixen.', passwordIncorrect: 'La contrasenya actual no és correcta.', passwordSaved: 'Contrasenya actualitzada',
    languageEyebrow: 'Preferències', languageTitle: 'Idioma de l’aplicació', welcome: 'Benvinguda a casa', loginTitle: 'El teu cafè.<br>Els teus segells.', phone: 'Telèfon', namePlaceholder: 'Com et dius?', privacy: 'Accepto la política de privacitat i el tractament de les meves dades segons el RGPD.', createAccount: 'Crear el meu compte',
    redeemReady: 'A punt per bescanviar', redeemCopy: 'Ensenya aquest codi a l’equip de Spirit. Caduca en 10 minuts.', confirmAtCafe: 'Confirmar a caixa', enjoy: 'Gaudeix-ne! Ens veiem aviat a Spirit ☕', shareText: 'Descobreix Cafeteria Spirit · Brunch and Specialty Coffee Montcada', shareCopied: 'Enllaç copiat per compartir', invalidImage: 'No s’ha pogut processar la imatge.'
  }
};

const defaultProfile = { firstName: 'Sofía', lastName: 'Fernández', email: 'sofia@email.com', photo: '' };
const state = {
  screen: 'intro', afterIntro: localStorage.getItem('spirit-seen') ? 'home' : (localStorage.getItem('spirit-onboarded') ? 'login' : 'onboarding'), onboarding: 0, stamps: 6, historyEmpty: false,
  lang: localStorage.getItem('spirit-language') === 'ca' ? 'ca' : 'es',
  theme: document.documentElement.dataset.theme || 'light',
  notifications: localStorage.getItem('spirit-notifications') !== 'false',
  profile: { ...defaultProfile, ...savedProfile }
};
const app = document.querySelector('#app');
const t = (key, values = {}) => Object.entries(values).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement), copy[state.lang][key] || key);
const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const saveProfile = () => localStorage.setItem('spirit-profile', JSON.stringify(state.profile));
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
    [t('onboarding1Title'),t('onboarding1Copy'),'cup'],
    [t('onboarding2Title'),t('onboarding2Copy'),'gift'],
    [t('onboarding3Title'),t('onboarding3Copy'),'card']
  ];
  const [title,copy,icon] = slides[state.onboarding];
  return `<main class="app-shell"><section class="screen screen--gold"><button class="skip" data-action="finish-onboarding">${t('skip')}</button>${brandLogo('hero')}<div class="welcome"><p class="eyebrow">Spirit Coffee Club</p><h1>${title}</h1><p class="subtitle">${copy}</p></div><div class="onboarding-art">${icons[icon]}</div><div class="dots">${slides.map((_,i)=>`<span class="dot ${i===state.onboarding?'dot--active':''}"></span>`).join('')}</div><button class="primary-button primary-button--light" data-action="next-onboarding">${state.onboarding===2?t('enter'):t('continue')}</button></section></main>`;
}

function home() {
  const stamps = Array.from({length:8},(_,i)=>`<span class="stamp ${i<state.stamps?'stamp--earned':''}">${icons.cup}</span>`).join('');
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar(true)}<p class="eyebrow">Brunch & specialty coffee</p><h1>${t('hello')}, ${escapeHTML(state.profile.firstName)} ✨<br>${t('coffeeToday')}</h1><article class="loyalty-card"><div class="loyalty-card__top"><div><span class="loyalty-card__label">${t('yourCard')}</span><div class="loyalty-card__count">${state.stamps}/8</div></div><span class="reward-chip">${t('freeCoffee')}</span></div><div class="stamps">${stamps}</div><div class="progress-copy">${t('stampsLeft',{count:8-state.stamps})}</div></article><div class="section-head"><h2>${t('quickAccess')}</h2></div>${quickAccess()}</section>${nav('home')}</main>`;
}

function rewards() {
  const rewards = [[t('specialtyCoffee'),8,'☕'],[t('artisanCookie'),6,'🍪'],[t('spiritBrunch'),14,'🥐']];
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">${t('rewardsEyebrow',{count:state.stamps})}</p><h1>${t('rewardsTitle')}</h1><p class="subtitle">${t('rewardsCopy')}</p><div class="section-head"><h2>${t('available')}</h2></div><div class="cards">${rewards.map(([name,n,emoji])=>`<article class="reward-card"><div class="reward-art">${emoji}</div><div><h3>${name}</h3><p>${t('madeNow')}</p><div class="reward-card__foot"><span class="cost">${n} ${t('stamps')}</span><button class="small-button" ${state.stamps<n?'disabled':''} data-redeem="${escapeHTML(name)}">${state.stamps<n?t('missingStamps'):t('redeem')}</button></div></div></article>`).join('')}</div></section>${nav('rewards')}</main>`;
}

function history() {
  const rows = [[t('visitStamp'),`${t('today')} · 10:42`,'+1','☕'],[t('visitStamp'),'8 jul · 18:16','+1','☕'],[t('artisanCookie'),'2 jul · 11:03','−6','🍪'],[t('visitStamp'),'28 jun · 09:32','+1','☕']];
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">${t('historyEyebrow')}</p><h1>${t('historyTitle')}</h1><div class="section-head"><h2>${t('movements')}</h2><button class="text-btn" data-action="toggle-empty">${state.historyEmpty?t('viewHistory'):t('viewEmpty')}</button></div>${state.historyEmpty?`<div class="empty"><div><div class="empty__icon">☕</div><h2>${t('noMovements')}</h2><p>${t('noMovementsCopy')}</p></div></div>`:`<div class="timeline">${rows.map(([title,date,points,emoji])=>`<div class="history-row"><div class="history-row__icon">${emoji}</div><div><div class="history-row__title">${title}</div><div class="history-row__date">${date}</div></div><div class="history-row__points ${points.startsWith('−')?'history-row__points--spent':''}">${points}</div></div>`).join('')}</div>`}</section>${nav('history')}</main>`;
}

function profile() {
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">${t('profileEyebrow')}</p><h1>${t('profileTitle')}</h1><div class="section-head"><h2>${t('yourAccount')}</h2></div><article class="profile-card">${avatar()}<div><h3>${escapeHTML(state.profile.firstName)} ${escapeHTML(state.profile.lastName)}</h3><p>${escapeHTML(state.profile.email)} · ${state.stamps} ${t('stamps')}</p></div></article><div class="section-head"><h2>${t('settings')}</h2></div><div class="settings-list"><button class="settings-row" data-action="open-personal"><span>${t('personalData')}</span><span>›</span></button><label class="settings-row settings-row--switch"><span>${t('notifications')}</span><span class="switch"><input type="checkbox" data-notifications ${state.notifications?'checked':''}><span class="switch__track" aria-hidden="true"></span></span></label><label class="settings-row settings-row--switch"><span>${t('darkMode')}</span><span class="switch"><input type="checkbox" data-theme-toggle ${state.theme==='dark'?'checked':''}><span class="switch__track" aria-hidden="true"></span></span></label><button class="settings-row" data-action="open-language"><span>${t('language')}</span><small>${state.lang==='ca'?t('catalan'):t('spanish')}</small></button><button class="settings-row" data-action="share"><span>${t('inviteFriend')}</span><span>›</span></button><button class="settings-row settings-row--danger" data-action="logout"><span>${t('logout')}</span><span>›</span></button></div><div class="section-head"><h2>Spirit Coffee</h2></div><p class="subtitle">Passeig Rocamora, 9<br>Montcada i Reixac · Barcelona</p></section>${nav('profile')}</main>`;
}

function login() {
  return `<main class="app-shell"><section class="screen screen--gold">${topbar()}<p class="eyebrow">${t('welcome')}</p><h1>${t('loginTitle')}</h1><form class="form" data-form="login"><div class="field"><label for="name">${t('firstName')}</label><input id="name" name="name" maxlength="28" autocomplete="name" placeholder="${t('namePlaceholder')}" required></div><div class="field"><label for="email">${t('email')}</label><input id="email" name="email" type="email" autocomplete="email" placeholder="tu@email.com" required></div><div class="field"><label for="phone">${t('phone')}</label><input id="phone" type="tel" autocomplete="tel" placeholder="+34 600 000 000" required></div><label class="check"><input type="checkbox" required><span>${t('privacy')}</span></label><button class="primary-button" type="submit">${t('createAccount')}</button></form></section></main>`;
}

const sheet = (content, className = '') => `<div class="modal-backdrop" data-sheet-backdrop><div class="modal ${className}" role="dialog" aria-modal="true">${content}</div></div>`;
function modal(name) { return sheet(`<p class="eyebrow">${t('redeemReady')}</p><h2>${escapeHTML(name)}</h2><p class="subtitle">${t('redeemCopy')}</p><div class="code">482 916</div><button class="primary-button" data-action="confirm-redeem">${t('confirmAtCafe')}</button>`); }

function personalSheet() {
  return sheet(`<div class="sheet-head"><div><p class="eyebrow">${t('personalEyebrow')}</p><h2>${t('personalTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div><form class="sheet-form" data-form="profile"><div class="photo-editor">${avatar('avatar avatar--editor')}<strong>${t('changePhoto')}</strong><div class="photo-actions"><label class="photo-action">${t('gallery')}<input type="file" accept="image/*" data-photo-input hidden></label><label class="photo-action">${t('camera')}<input type="file" accept="image/*" capture="environment" data-photo-input hidden></label></div></div><div class="field"><label for="profile-first">${t('firstName')}</label><input id="profile-first" name="firstName" value="${escapeHTML(state.profile.firstName)}" maxlength="28" autocomplete="given-name" required></div><div class="field"><label for="profile-last">${t('lastName')}</label><input id="profile-last" name="lastName" value="${escapeHTML(state.profile.lastName)}" maxlength="42" autocomplete="family-name" required></div><div class="field"><label for="profile-email">${t('email')}</label><input id="profile-email" value="${escapeHTML(state.profile.email)}" type="email" readonly aria-describedby="email-note"><small id="email-note" class="field-note">${t('emailReadOnly')}</small></div><button class="sheet-link" type="button" data-action="open-password"><span>${t('changePassword')}</span><span>›</span></button><button class="primary-button" type="submit">${t('save')}</button></form>`, 'modal--form');
}

function languageSheet() {
  return sheet(`<div class="sheet-head"><div><p class="eyebrow">${t('languageEyebrow')}</p><h2>${t('languageTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div><div class="language-options"><button class="language-option ${state.lang==='es'?'language-option--active':''}" data-language="es"><span>${t('spanish')}</span><span>${state.lang==='es'?'✓':''}</span></button><button class="language-option ${state.lang==='ca'?'language-option--active':''}" data-language="ca"><span>${t('catalan')}</span><span>${state.lang==='ca'?'✓':''}</span></button></div>`, 'modal--form');
}

function passwordSheet() {
  return sheet(`<div class="sheet-head"><div><p class="eyebrow">${t('passwordEyebrow')}</p><h2>${t('passwordTitle')}</h2></div><button class="sheet-close" type="button" data-action="close-sheet" aria-label="${t('close')}">×</button></div><form class="sheet-form" data-form="password"><div class="field"><label for="current-password">${t('currentPassword')}</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="new-password">${t('newPassword')}</label><input id="new-password" name="newPassword" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label for="confirm-password">${t('confirmPassword')}</label><input id="confirm-password" name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></div><p class="form-error" data-password-error role="alert"></p><button class="primary-button" type="submit">${t('save')}</button></form>`, 'modal--form');
}

function finishIntro() {
  if (state.screen !== 'intro') return;
  state.screen = state.afterIntro;
  render();
}

function logout() {
  localStorage.removeItem('spirit-seen');
  localStorage.setItem('spirit-onboarded', '1');
  localStorage.removeItem('spirit-profile');
  localStorage.removeItem('spirit-password-hash');
  state.profile = { ...defaultProfile };
  state.historyEmpty = false;
  state.onboarding = 0;
  state.screen = 'login';
  render();
  scrollTo(0, 0);
}

function render() {
  document.documentElement.lang = state.lang;
  app.innerHTML = ({intro,onboarding,login,home,rewards,history,profile})[state.screen]();
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

async function hashPassword(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  document.querySelectorAll('[data-nav]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{state.screen=el.dataset.nav; render(); scrollTo(0,0);})});
  document.querySelectorAll('[data-redeem]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{if(!el.disabled){app.insertAdjacentHTML('beforeend',modal(el.dataset.redeem)); bind();}})});
  document.querySelectorAll('[data-action]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{
    const action=el.dataset.action;
    if(action==='skip-intro'){ clearTimeout(render.introFallback); finishIntro(); }
    if(action==='next-onboarding'){ if(state.onboarding<2) state.onboarding++; else { localStorage.setItem('spirit-onboarded','1'); state.screen='login'; } render(); }
    if(action==='finish-onboarding'){ localStorage.setItem('spirit-onboarded','1'); state.screen='login'; render(); }
    if(action==='close-sheet'){ document.querySelector('[data-sheet-backdrop]')?.remove(); }
    if(action==='open-personal'){ openSheet(personalSheet()); }
    if(action==='open-language'){ openSheet(languageSheet()); }
    if(action==='open-password'){ openSheet(passwordSheet()); }
    if(action==='share'){ shareSpirit(); }
    if(action==='confirm-redeem'){ state.stamps=0; document.querySelector('[data-sheet-backdrop]')?.remove(); showToast(t('enjoy')); setTimeout(()=>{state.screen='home';render();},900); }
    if(action==='toggle-empty'){ state.historyEmpty=!state.historyEmpty; render(); }
    if(action==='logout'){ logout(); }
  })});
  document.querySelectorAll('[data-sheet-backdrop]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',(event)=>{if(event.target===el)el.remove();})});
  document.querySelectorAll('[data-language]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{state.lang=el.dataset.language;localStorage.setItem('spirit-language',state.lang);document.querySelector('[data-sheet-backdrop]')?.remove();render();})});
  document.querySelectorAll('[data-notifications]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('change',(event)=>{state.notifications=event.currentTarget.checked;localStorage.setItem('spirit-notifications',String(state.notifications));})});
  document.querySelectorAll('[data-theme-toggle]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('change',(event)=>applyTheme(event.currentTarget.checked?'dark':'light',true))});
  document.querySelectorAll('[data-photo-input]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('change',async(event)=>{try{state.profile.photo=await imageToAvatar(event.currentTarget.files[0]);saveProfile();document.querySelectorAll('.avatar').forEach(avatarElement=>{avatarElement.innerHTML=`<img src="${state.profile.photo}" alt="${escapeHTML(state.profile.firstName)}">`;});}catch{showToast(t('invalidImage'));}event.currentTarget.value='';})});
  document.querySelector('[data-form="login"]')?.addEventListener('submit',(e)=>{e.preventDefault();const data=new FormData(e.currentTarget);const fullName=data.get('name').trim().split(/\s+/);state.profile.firstName=fullName.shift()||state.profile.firstName;state.profile.lastName=fullName.join(' ')||state.profile.lastName;state.profile.email=data.get('email').trim();saveProfile();localStorage.setItem('spirit-seen','1');state.screen='home';render();});
  document.querySelector('[data-form="profile"]')?.addEventListener('submit',(e)=>{e.preventDefault();const data=new FormData(e.currentTarget);state.profile.firstName=data.get('firstName').trim();state.profile.lastName=data.get('lastName').trim();saveProfile();document.querySelector('[data-sheet-backdrop]')?.remove();render();});
  document.querySelector('[data-form="password"]')?.addEventListener('submit',async(e)=>{e.preventDefault();const data=new FormData(e.currentTarget);const current=data.get('currentPassword');const next=data.get('newPassword');const confirmation=data.get('confirmPassword');const error=e.currentTarget.querySelector('[data-password-error]');error.textContent='';if(next.length<8){error.textContent=t('passwordLength');return;}if(next!==confirmation){error.textContent=t('passwordMismatch');return;}const savedHash=localStorage.getItem('spirit-password-hash');if(savedHash&&await hashPassword(current)!==savedHash){error.textContent=t('passwordIncorrect');return;}localStorage.setItem('spirit-password-hash',await hashPassword(next));document.querySelector('[data-sheet-backdrop]')?.remove();});
}

render();

if (!localStorage.getItem('spirit-theme')) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => applyTheme(event.matches ? 'dark' : 'light'));
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
