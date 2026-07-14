const icons = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 7v14M12 7H7.5a2.5 2.5 0 1 1 2.5-2.5C10 6 12 7 12 7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5C14 6 12 7 12 7Z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>`,
  cup: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM17 10h2a3 3 0 0 1 0 6h-2M7 4c0 1 1 1 1 2M11 3c0 1 1 1 1 3M15 4c0 1 1 1 1 2"/></svg>`,
  card: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-2-2 2c-3.4-1.4-6.2-4.2-7.6-7.6l2-2z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.6Z"/><path d="M8.1 7.5c.2-.5.5-.5.8-.5h.5l1 2.3-.8 1c.8 1.6 2.1 2.9 3.7 3.6l1-.9 2.4 1.1v.6c0 .6-.3 1.1-.8 1.4-.7.4-1.7.5-2.7.2-3.9-1.1-6.4-3.8-6.8-6.5-.1-.9.2-1.7.7-2.3Z"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v11.2a4.3 4.3 0 1 1-3.6-4.2v3.1a1.4 1.4 0 1 0 .7 1.2V3h2.9Z"/><path d="M14 3c.5 2.8 2.2 4.4 5 4.8v3.1a8.6 8.6 0 0 1-5-2"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8h14l1 13H4zM9 9V6a3 3 0 0 1 6 0v3"/></svg>`,
};

const state = { screen: 'intro', afterIntro: localStorage.getItem('spirit-seen') ? 'home' : 'onboarding', onboarding: 0, stamps: 6, user: 'Sofía', historyEmpty: false };
const app = document.querySelector('#app');
const brandLogo = (variant = 'header') => `<img class="brand-logo brand-logo--${variant}" src="assets/spirit-logo-header.png" alt="Spirit">`;

const nav = (active) => `<nav class="bottom-nav" aria-label="Navegación principal">
  ${[['home','Inicio','home'],['rewards','Premios','gift'],['history','Historial','clock'],['profile','Perfil','user']].map(([id,label,icon]) => `<button class="nav-item ${active===id?'nav-item--active':''}" data-nav="${id}" aria-label="${label}"><span class="nav-icon">${icons[icon]}</span><span>${label}</span></button>`).join('')}
</nav>`;

const topbar = () => `<header class="topbar topbar--centered"><div class="brand">${brandLogo('home')}</div></header>`;

const quickLinks = [
  {name: 'Carta', subtitle: 'Ver menú', icon: 'card', href: 'https://www.canva.com/design/DAFuLPRj4h0/7QGyk7rWcsZD3K84qNLTqA/view?utm_content=DAFuLPRj4h0&utm_campaign=designshare&utm_medium=link&utm_source=editor'},
  {name: 'WhatsApp', subtitle: 'Escríbenos', icon: 'whatsapp', href: 'https://api.whatsapp.com/send/?phone=34697721877&text&type=phone_number&app_absent=0'},
  {name: 'Instagram', subtitle: 'Síguenos', icon: 'camera', href: 'https://www.instagram.com/cafeteriaspirit?igsh=MXBwZ3Y0NnhlNDYxag%3D%3D'},
  {name: 'TikTok', subtitle: 'Vídeos', icon: 'tiktok', href: 'https://www.tiktok.com/@spiritcoffee?_t=8mkgPy4coZF&_r=1'},
  {name: 'Google', subtitle: 'Déjanos una reseña', icon: 'star', href: 'https://google.com/maps/place//data=!4m3!3m2!1s0x12a4bdafe69b5aed:0x4b27331104bb0ad2!12e1?source=g.page.m.dd._&laa=lu-desktop-reviews-dialog-review-solicitation'},
  {name: 'Just Eat', subtitle: 'Pedir a domicilio', image: 'assets/just-eat-logo.avif', href: 'https://www.just-eat.es/restaurants-spirit-and-coffee-montcada-i-reixac'},
  {name: 'Uber Eats', subtitle: 'Pedir a domicilio', image: 'assets/uber-eats-logo.png', transparentIcon: true, href: 'https://www.ubereats.com/es/store/spirit-%26-coffee/S3m66DcHSLCtmmwzHhlp7A?diningMode=DELIVERY'},
];

const quickAccess = () => `<div class="quick-grid">${quickLinks.map((item) => `<a class="quick-card" href="${item.href}" target="_blank" rel="noopener noreferrer" aria-label="${item.name}: ${item.subtitle}"><span class="quick-card__icon ${item.transparentIcon ? 'quick-card__icon--transparent' : ''}">${item.image ? `<img src="${item.image}" alt="" loading="lazy">` : icons[item.icon]}</span><span class="quick-card__copy"><strong>${item.name}</strong><small>${item.subtitle}</small></span></a>`).join('')}</div>`;

function intro() {
  return `<main class="intro-screen" data-action="skip-intro" aria-label="Introducción de Cafetería Spirit. Toca para omitir.">
    <video class="intro-video" autoplay muted playsinline preload="auto" data-intro-video>
      <source src="assets/spirit-coffee-intro.mp4" type="video/mp4">
    </video>
    <button class="intro-skip" type="button" data-action="skip-intro" aria-label="Omitir introducción">Omitir</button>
  </main>`;
}

function onboarding() {
  const slides = [
    ['Cada café suma','Guarda tus sellos sin tarjetas de papel. Cada visita te acerca a tu próximo café.','cup'],
    ['Tus recompensas, a un toque','Consulta lo que tienes disponible y canjéalo directamente en la cafetería.','gift'],
    ['Todo Spirit en un solo sitio','La carta, tus pedidos y nuestras redes siempre a mano.','card']
  ];
  const [title,copy,icon] = slides[state.onboarding];
  return `<main class="app-shell"><section class="screen screen--gold"><button class="skip" data-action="finish-onboarding">Omitir</button>${brandLogo('hero')}<div class="welcome"><p class="eyebrow">Spirit Coffee Club</p><h1>${title}</h1><p class="subtitle">${copy}</p></div><div class="onboarding-art">${icons[icon]}</div><div class="dots">${slides.map((_,i)=>`<span class="dot ${i===state.onboarding?'dot--active':''}"></span>`).join('')}</div><button class="primary-button primary-button--light" data-action="next-onboarding">${state.onboarding===2?'Entrar en Spirit':'Continuar'}</button></section></main>`;
}

function home() {
  const stamps = Array.from({length:8},(_,i)=>`<span class="stamp ${i<state.stamps?'stamp--earned':''}">${icons.cup}</span>`).join('');
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">Brunch & specialty coffee</p><h1>Hola, ${state.user} ✨<br>Hoy toca café.</h1><article class="loyalty-card"><div class="loyalty-card__top"><div><span class="loyalty-card__label">Tu tarjeta Spirit</span><div class="loyalty-card__count">${state.stamps}/8</div></div><span class="reward-chip">Café gratis</span></div><div class="stamps">${stamps}</div><div class="progress-copy">Te quedan ${8-state.stamps} sellos para tu café gratis</div></article><div class="section-head"><h2>Accesos rápidos</h2></div>${quickAccess()}</section>${nav('home')}</main>`;
}

function rewards() {
  const rewards = [['Café de especialidad','8 sellos','☕',8],['Cookie artesana','6 sellos','🍪',6],['Brunch Spirit','14 sellos','🥐',14]];
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">Tienes ${state.stamps} sellos</p><h1>Algo bueno<br>te espera.</h1><p class="subtitle">Canjea tus sellos en caja y disfruta de tu momento Spirit.</p><div class="section-head"><h2>Disponibles</h2></div><div class="cards">${rewards.map(([name,cost,emoji,n])=>`<article class="reward-card"><div class="reward-art">${emoji}</div><div><h3>${name}</h3><p>Preparado al momento con mucho mimo.</p><div class="reward-card__foot"><span class="cost">${cost}</span><button class="small-button" ${state.stamps<n?'disabled':''} data-redeem="${name}">${state.stamps<n?'Te faltan sellos':'Canjear'}</button></div></div></article>`).join('')}</div></section>${nav('rewards')}</main>`;
}

function history() {
  const rows = [['Sello por visita','Hoy · 10:42','+1','☕'],['Sello por visita','8 jul · 18:16','+1','☕'],['Cookie artesana','2 jul · 11:03','−6','🍪'],['Sello por visita','28 jun · 09:32','+1','☕']];
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">Tus momentos Spirit</p><h1>Cada visita<br>cuenta.</h1><div class="section-head"><h2>Movimientos</h2><button class="text-btn" data-action="toggle-empty">${state.historyEmpty?'Ver historial':'Ver vacío'}</button></div>${state.historyEmpty?`<div class="empty"><div><div class="empty__icon">☕</div><h2>Aún no hay movimientos</h2><p>¡Ven a por tu primer sello! Tu historia Spirit empieza con un café.</p></div></div>`:`<div class="timeline">${rows.map(([title,date,points,emoji])=>`<div class="history-row"><div class="history-row__icon">${emoji}</div><div><div class="history-row__title">${title}</div><div class="history-row__date">${date}</div></div><div class="history-row__points ${points.startsWith('−')?'history-row__points--spent':''}">${points}</div></div>`).join('')}</div>`}</section>${nav('history')}</main>`;
}

function profile() {
  return `<main class="app-shell"><section class="screen screen--with-nav">${topbar()}<p class="eyebrow">Tu espacio</p><h1>Muy tú.<br>Muy Spirit.</h1><div class="section-head"><h2>Tu cuenta</h2></div><article class="profile-card"><div class="avatar">SF</div><div><h3>${state.user} Fernández</h3><p>sofia@email.com · 6 sellos</p></div></article><div class="section-head"><h2>Ajustes</h2></div><div class="settings-list"><button class="settings-row" data-toast="Edición de datos"><span>Datos personales</span><span>›</span></button><button class="settings-row" data-toast="Preferencias guardadas"><span>Notificaciones</span><small>Activadas</small></button><button class="settings-row" data-toast="Selector de idioma"><span>Idioma</span><small>Español</small></button><button class="settings-row" data-toast="Enlace copiado"><span>Invita a un amigo</span><span>›</span></button><button class="settings-row" data-action="logout"><span>Cerrar sesión</span><span>›</span></button></div><div class="section-head"><h2>Spirit Coffee</h2></div><p class="subtitle">Passeig Rocamora, 9<br>Montcada i Reixac · Barcelona</p></section>${nav('profile')}</main>`;
}

function login() {
  return `<main class="app-shell"><section class="screen screen--gold">${topbar()}<p class="eyebrow">Bienvenida a casa</p><h1>Tu café.<br>Tus sellos.</h1><form class="form" data-form="login"><div class="field"><label for="name">Nombre</label><input id="name" name="name" maxlength="28" autocomplete="name" placeholder="¿Cómo te llamas?" required></div><div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" placeholder="tu@email.com" required></div><div class="field"><label for="phone">Teléfono</label><input id="phone" type="tel" autocomplete="tel" placeholder="+34 600 000 000" required></div><label class="check"><input type="checkbox" required><span>Acepto la política de privacidad y el tratamiento de mis datos según el RGPD.</span></label><button class="primary-button" type="submit">Crear mi cuenta</button></form></section></main>`;
}

function modal(name) { return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()"><p class="eyebrow">Listo para canjear</p><h2 id="modal-title">${name}</h2><p class="subtitle">Enseña este código al equipo de Spirit. Caduca en 10 minutos.</p><div class="code">482 916</div><button class="primary-button" data-action="confirm-redeem">Confirmar en caja</button></div></div>`; }

function finishIntro() {
  if (state.screen !== 'intro') return;
  state.screen = state.afterIntro;
  render();
}

function render() {
  app.innerHTML = ({intro,onboarding,login,home,rewards,history,profile})[state.screen]();
  bind();
  if (state.screen === 'intro') {
    const video = document.querySelector('[data-intro-video]');
    video.addEventListener('ended', finishIntro, {once: true});
    video.addEventListener('error', finishIntro, {once: true});
    video.play().catch(() => {});
    clearTimeout(render.introFallback);
    render.introFallback = setTimeout(finishIntro, 4300);
  }
}
function showToast(message) { const toast=document.querySelector('#toast'); toast.textContent=message; toast.classList.add('toast--show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.remove('toast--show'),2200); }

function bind() {
  document.querySelectorAll('[data-nav]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{state.screen=el.dataset.nav; render(); scrollTo(0,0);})});
  document.querySelectorAll('[data-toast]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>showToast(el.dataset.toast))});
  document.querySelectorAll('[data-redeem]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{if(!el.disabled){app.insertAdjacentHTML('beforeend',modal(el.dataset.redeem)); bind();}})});
  document.querySelectorAll('[data-action]:not([data-bound])').forEach(el=>{el.dataset.bound='1';el.addEventListener('click',()=>{
    const action=el.dataset.action;
    if(action==='skip-intro'){ clearTimeout(render.introFallback); finishIntro(); }
    if(action==='next-onboarding'){ if(state.onboarding<2) state.onboarding++; else { localStorage.setItem('spirit-seen','1'); state.screen='login'; } render(); }
    if(action==='finish-onboarding'){ localStorage.setItem('spirit-seen','1'); state.screen='login'; render(); }
    if(action==='close-modal'){ el.remove(); }
    if(action==='confirm-redeem'){ state.stamps=0; document.querySelector('.modal-backdrop')?.remove(); showToast('¡Disfrútalo! Nos vemos pronto en Spirit ☕'); setTimeout(()=>{state.screen='home';render();},900); }
    if(action==='toggle-empty'){ state.historyEmpty=!state.historyEmpty; render(); }
    if(action==='logout'){ localStorage.removeItem('spirit-seen'); state.onboarding=0; state.screen='onboarding'; render(); }
  })});
  document.querySelector('[data-form="login"]')?.addEventListener('submit',(e)=>{e.preventDefault(); const name=new FormData(e.currentTarget).get('name').trim(); state.user=name.split(' ')[0]||'Sofía'; localStorage.setItem('spirit-seen','1'); state.screen='home'; render(); });
}

render();
