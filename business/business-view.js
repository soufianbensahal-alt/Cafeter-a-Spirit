import {
  MockLoyaltyError,
  mockBeginLoyaltySimulation,
  mockConfirmStamp,
  mockEndLoyaltySimulation,
  mockGetRecentTransactions,
  mockPrepareConfirmation
} from '../services/mock-loyalty-service.js';
import {
  StampSessionError,
  validateStampCode,
  validateStampQr
} from '../services/stamp-session-service.js';
import {
  EmployeeAuthorizationError,
  restoreEmployeeSession,
  signInEmployee,
  signOut,
  subscribeToAuthChanges
} from '../services/employee-service.js';

const isBusinessRoute = /^\/cafeteria\/?$/.test(window.location.pathname);

if (isBusinessRoute) {
  const app = document.querySelector('#app');
  document.body.classList.add('business-mode');
  document.title = 'SPIRIT · Modo cafetería';

  const state = {
    view: 'checking',
    employee: null,
    code: '',
    error: '',
    loading: false,
    confirming: false,
    stampSession: null,
    confirmation: null,
    transactions: [],
    cameras: [],
    selectedCamera: '',
    scannerMessage: ''
  };

  let cameraStream = null;
  let scanFrame = 0;
  let scannerBusy = false;
  let detector = null;
  let manualSignOut = false;
  let lastScannedContent = '';
  let lastScannedAt = 0;

  const icons = {
    scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M7 12h10"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };

  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const formatTime = (timestamp) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  const employeeInitials = () => String(state.employee?.employeeName || 'SP').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const roleLabel = (role) => ({ owner: 'Propietario', manager: 'Responsable', employee: 'Empleado' })[role] || 'Empleado';

  const brandHeader = () => `<header class="business-header"><img src="/assets/spirit-logo-header.png" alt="Spirit"><div><span class="business-kicker">${escapeHTML(state.employee?.businessName || 'Panel de equipo')}</span><strong>Modo cafetería</strong></div><span class="session-badge"><i></i>Sesión segura</span></header>`;

  const transactionList = () => `<section class="business-history" aria-labelledby="recent-title"><div class="business-section-head"><div><span class="business-kicker">Actividad</span><h2 id="recent-title">Últimas operaciones</h2></div>${icons.clock}</div>${state.transactions.length ? `<ol>${state.transactions.map((item) => `<li><time datetime="${escapeHTML(item.timestamp)}">${formatTime(item.timestamp)}</time><div><strong>${escapeHTML(item.customerMasked)}</strong><span>${escapeHTML(item.result)}</span></div><b>${escapeHTML(item.progress)}</b></li>`).join('')}</ol>` : '<p class="business-empty">Todavía no hay operaciones en esta sesión.</p>'}</section>`;

  const homeView = () => `<main class="business-app">${brandHeader()}<section class="employee-strip"><div class="employee-avatar" aria-hidden="true">${escapeHTML(employeeInitials())}</div><div><span>${escapeHTML(roleLabel(state.employee?.role))}</span><strong>${escapeHTML(state.employee?.employeeName || '')}</strong></div><span class="employee-status">Activa</span></section><section class="business-action-card"><p class="business-kicker">Añadir un sello</p><h1>Procesa al cliente en segundos.</h1><p>Escanea su QR temporal o introduce el código de seis dígitos.</p><button class="business-primary business-primary--scan" type="button" data-business-action="open-scanner">${icons.scan}<span>Escanear QR</span></button><div class="business-divider"><span>o</span></div><form class="business-code-form" data-business-form="code" novalidate><label for="business-code">Código del cliente</label><input id="business-code" name="code" type="text" value="${escapeHTML(state.code)}" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" enterkeyhint="done" placeholder="000000" aria-describedby="business-code-help business-error" ${state.loading ? 'disabled' : ''}><small id="business-code-help">Exactamente 6 dígitos · válido durante 60 segundos</small><p class="business-message business-message--error" id="business-error" role="alert">${escapeHTML(state.error)}</p><button class="business-primary" type="submit" ${state.code.length !== 6 || state.loading ? 'disabled' : ''}>${state.loading ? '<span class="business-spinner" aria-hidden="true"></span>Validando…' : 'Validar código'}</button></form></section>${transactionList()}<button class="business-logout" type="button" data-business-action="logout">Cerrar sesión</button><p class="business-security-note">Acceso protegido con Supabase Auth · QR y códigos se validan en el servidor. La confirmación del sello sigue en modo demostración.</p></main>`;

  const progress = (value, goal) => `<div class="business-progress" role="img" aria-label="${value} de ${goal} sellos"><div><strong>${value}</strong><span>/ ${goal}</span></div><div class="business-progress__track"><span style="width:${(value / goal) * 100}%"></span></div></div>`;

  const previewView = () => {
    const session = state.stampSession;
    return `<main class="business-app">${brandHeader()}<section class="business-preview"><button class="business-back" type="button" data-business-action="cancel-preview">← Cancelar</button><p class="business-kicker">Confirmación necesaria</p><h1>Revisa antes de añadir.</h1><div class="customer-card"><div class="customer-card__heading"><span class="customer-avatar" aria-hidden="true">S</span><div><small>Cliente</small><strong>${escapeHTML(session.customer)}</strong></div></div><dl><div><dt>Programa</dt><dd>${escapeHTML(session.program)}</dd></div><div><dt>Progreso actual</dt><dd>${session.currentProgress} de ${session.goal} sellos</dd></div><div><dt>Tras confirmar</dt><dd>${session.nextProgress} de ${session.goal} sellos</dd></div><div><dt>Recompensa</dt><dd>${escapeHTML(session.reward)}</dd></div></dl>${progress(session.nextProgress, session.goal)}</div><p class="business-message business-message--error" role="alert">${escapeHTML(state.error)}</p><button class="business-primary business-primary--confirm" type="button" data-business-action="confirm-stamp" ${state.confirming ? 'disabled' : ''}>${state.confirming ? '<span class="business-spinner" aria-hidden="true"></span>Añadiendo sello…' : 'Confirmar sello'}</button><button class="business-secondary" type="button" data-business-action="cancel-preview" ${state.confirming ? 'disabled' : ''}>Cancelar</button></section></main>`;
  };

  const successView = () => `<main class="business-app business-app--success">${brandHeader()}<section class="business-success"><span class="business-success__icon">${icons.check}</span><p class="business-kicker">Operación completada</p><h1>Sello añadido.</h1><p>El cliente ya tiene <strong>${state.confirmation.progress} de ${state.confirmation.goal} sellos</strong> en su Tarjeta Café Spirit.</p><button class="business-primary" type="button" data-business-action="next-customer">Procesar siguiente cliente</button><button class="business-secondary" type="button" data-business-action="next-customer">Volver al inicio</button></section>${transactionList()}</main>`;

  const scannerView = () => `<main class="business-app business-app--scanner"><header class="scanner-header"><div><span class="business-kicker">Modo cafetería</span><strong>Escanear QR</strong></div><button type="button" data-business-action="close-scanner" aria-label="Cerrar escáner">×</button></header><section class="scanner-card"><div class="scanner-viewport"><video data-scanner-video playsinline muted aria-label="Vista de la cámara"></video><div class="scanner-guide" aria-hidden="true"><span></span><span></span><span></span><span></span></div></div><p class="scanner-instruction">Coloca el QR del cliente dentro del recuadro.</p>${state.cameras.length > 1 ? `<label class="camera-select">Cámara<select data-camera-select>${state.cameras.map((camera, index) => `<option value="${escapeHTML(camera.deviceId)}" ${camera.deviceId === state.selectedCamera ? 'selected' : ''}>${escapeHTML(camera.label || `Cámara ${index + 1}`)}</option>`).join('')}</select></label>` : ''}<p class="business-message business-message--scanner" role="status">${escapeHTML(state.scannerMessage)}</p><p class="business-message business-message--error" role="alert">${escapeHTML(state.error)}</p><button class="business-secondary business-secondary--light" type="button" data-business-action="close-scanner">Introducir código manualmente</button></section></main>`;

  const signedOutView = () => `<main class="business-app business-app--signed-out"><section class="signed-out-card"><img src="/assets/spirit-logo-header.png" alt="Spirit"><p class="business-kicker">Modo cafetería</p><h1>Acceso de equipo.</h1><p>Inicia sesión con la cuenta autorizada de Cafetería Spirit.</p><form class="business-login-form" data-business-form="login" novalidate><label for="employee-email">Correo electrónico</label><input id="employee-email" name="email" type="email" autocomplete="username" inputmode="email" required><label for="employee-password">Contraseña</label><input id="employee-password" name="password" type="password" minlength="8" autocomplete="current-password" required><p class="business-message business-message--error" role="alert">${escapeHTML(state.error)}</p><button class="business-primary" type="submit" ${state.loading ? 'disabled' : ''}>${state.loading ? '<span class="business-spinner" aria-hidden="true"></span>Comprobando…' : 'Acceder'}</button></form></section></main>`;

  const authStateView = (title, copy, action = 'retry-auth', actionLabel = 'Volver a comprobar') => `<main class="business-app business-app--signed-out"><section class="signed-out-card"><img src="/assets/spirit-logo-header.png" alt="Spirit"><p class="business-kicker">Modo cafetería</p><h1>${escapeHTML(title)}</h1><p>${escapeHTML(copy)}</p><button class="business-primary" type="button" data-business-action="${action}">${escapeHTML(actionLabel)}</button><button class="business-secondary" type="button" data-business-action="logout">Cerrar sesión</button></section></main>`;
  const unauthorizedView = () => authStateView('Acceso no autorizado.', state.error || 'Tu cuenta no tiene una membresía activa para este negocio.');
  const expiredView = () => authStateView('Sesión caducada.', 'Vuelve a iniciar sesión para continuar.', 'show-login', 'Iniciar sesión');
  const networkErrorView = () => authStateView('Sin conexión.', state.error || 'No se ha podido validar tu acceso. Revisa tu conexión.');
  const loadingView = () => `<main class="business-app business-app--loading"><img src="/assets/spirit-logo-header.png" alt="Spirit"><span class="business-spinner" aria-hidden="true"></span><p>Comprobando sesión y permisos…</p></main>`;

  function render() {
    stopScannerIfLeaving();
    const views = { checking: loadingView, home: homeView, preview: previewView, success: successView, scanner: scannerView, signedOut: signedOutView, unauthorized: unauthorizedView, expired: expiredView, networkError: networkErrorView };
    app.innerHTML = views[state.view]();
    bind();
    if (state.view === 'scanner') startScanner();
  }

  function readableError(error) {
    if (error instanceof StampSessionError) return error.message;
    if (error instanceof MockLoyaltyError) return error.message;
    if (error?.code === 'invalid_credentials') return 'El correo o la contraseña no son correctos.';
    if (error?.code === 'email_not_confirmed') return 'Confirma tu correo antes de iniciar sesión.';
    if (error instanceof EmployeeAuthorizationError || error?.message) return error.message;
    return 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
  }

  async function loadAuthorizedHome(employee) {
    state.view = 'checking';
    render();
    try {
      state.employee = employee;
      mockBeginLoyaltySimulation(employee);
      state.transactions = await mockGetRecentTransactions();
      state.view = 'home';
    } catch (error) {
      state.error = readableError(error);
      state.view = 'signedOut';
    }
    render();
  }

  function routeAuthorizationError(error) {
    state.error = readableError(error);
    if (error?.code === 'not_authenticated') state.view = 'signedOut';
    else if (error?.code === 'network_error') state.view = 'networkError';
    else if (['no_membership', 'inactive_membership', 'inactive_business'].includes(error?.code)) state.view = 'unauthorized';
    else state.view = 'signedOut';
  }

  async function restoreAccess() {
    state.view = 'checking';
    state.error = '';
    render();
    try {
      const employee = await restoreEmployeeSession();
      if (!employee) {
        state.view = 'signedOut';
        render();
        return;
      }
      await loadAuthorizedHome(employee);
    } catch (error) {
      routeAuthorizationError(error);
      render();
    }
  }

  async function submitEmployeeLogin(form) {
    if (state.loading) return;
    const data = new FormData(form);
    state.loading = true;
    state.error = '';
    render();
    try {
      const employee = await signInEmployee(data.get('email'), data.get('password'));
      await loadAuthorizedHome(employee);
    } catch (error) {
      routeAuthorizationError(error);
      if (state.view === 'unauthorized') return render();
      state.view = error?.code === 'network_error' ? 'networkError' : 'signedOut';
      render();
    } finally {
      state.loading = false;
      render();
    }
  }

  async function validateCode() {
    if (state.loading) return;
    if (state.code.length !== 6) {
      state.error = 'Introduce un código de 6 dígitos.';
      render();
      return;
    }
    state.loading = true;
    state.error = '';
    render();
    try {
      const validated = await validateStampCode(state.employee.businessId, state.code);
      state.stampSession = mockPrepareConfirmation(validated);
      state.code = '';
      state.view = 'preview';
    } catch (error) {
      state.error = readableError(error);
      if (error?.code === 'session_expired') state.view = 'expired';
    } finally {
      state.loading = false;
      render();
    }
  }

  async function confirmStamp() {
    if (state.confirming) return;
    state.confirming = true;
    state.error = '';
    render();
    try {
      state.confirmation = await mockConfirmStamp(state.stampSession);
      state.transactions = await mockGetRecentTransactions();
      state.view = 'success';
    } catch (error) {
      state.error = readableError(error);
      if (error?.code === 'session_expired') state.view = 'expired';
    } finally {
      state.confirming = false;
      render();
    }
  }

  function resetCustomer() {
    state.code = '';
    state.error = '';
    state.stampSession = null;
    state.confirmation = null;
    state.view = 'home';
    render();
  }

  function cameraError(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Permiso de cámara rechazado. Actívalo en los ajustes o utiliza el código manual.';
    if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'No se ha encontrado una cámara disponible en este dispositivo.';
    if (!navigator.mediaDevices?.getUserMedia) return 'La cámara no está disponible en este navegador.';
    return 'No se ha podido iniciar el escáner. Utiliza el código manual.';
  }

  function stopScanner() {
    cancelAnimationFrame(scanFrame);
    scanFrame = 0;
    scannerBusy = false;
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    lastScannedContent = '';
    lastScannedAt = 0;
    const video = document.querySelector('[data-scanner-video]');
    if (video) video.srcObject = null;
  }

  function stopScannerIfLeaving() {
    if (state.view !== 'scanner' && cameraStream) stopScanner();
  }

  async function detectFrames(video) {
    if (!detector || !cameraStream || state.view !== 'scanner') return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !scannerBusy) {
      try {
        const codes = await detector.detect(video);
        const content = codes[0]?.rawValue;
        if (content) {
          const now = Date.now();
          if (content === lastScannedContent && now - lastScannedAt < 3000) {
            scanFrame = requestAnimationFrame(() => detectFrames(video));
            return;
          }
          lastScannedContent = content;
          lastScannedAt = now;
          scannerBusy = true;
          state.scannerMessage = 'QR detectado. Validando…';
          state.error = '';
          renderScannerMessages();
          try {
            const validated = await validateStampQr(state.employee.businessId, content);
            state.stampSession = mockPrepareConfirmation(validated);
            stopScanner();
            state.view = 'preview';
            render();
            return;
          } catch (error) {
            state.error = readableError(error);
            state.scannerMessage = '';
            renderScannerMessages();
            setTimeout(() => { scannerBusy = false; }, 900);
          }
        }
      } catch {
        state.error = 'Error inesperado al leer el QR. Vuelve a intentarlo.';
        renderScannerMessages();
      }
    }
    scanFrame = requestAnimationFrame(() => detectFrames(video));
  }

  function renderScannerMessages() {
    const status = document.querySelector('.business-message--scanner');
    const error = document.querySelector('.business-message--error');
    if (status) status.textContent = state.scannerMessage;
    if (error) error.textContent = state.error;
  }

  async function startScanner(deviceId = state.selectedCamera) {
    stopScanner();
    state.error = '';
    state.scannerMessage = 'Solicitando acceso a la cámara…';
    renderScannerMessages();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Camera unavailable', 'NotSupportedError');
      if (!('BarcodeDetector' in window)) {
        state.error = 'Este navegador no admite lectura QR nativa. Utiliza el código manual.';
        state.scannerMessage = '';
        renderScannerMessages();
        return;
      }
      const supported = await BarcodeDetector.getSupportedFormats?.();
      if (supported && !supported.includes('qr_code')) throw new DOMException('QR unavailable', 'NotSupportedError');
      detector = new BarcodeDetector({ formats: ['qr_code'] });
      const videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.cameras = devices.filter((device) => device.kind === 'videoinput');
      const activeTrack = cameraStream.getVideoTracks()[0];
      state.selectedCamera = activeTrack.getSettings().deviceId || deviceId || '';
      const video = document.querySelector('[data-scanner-video]');
      if (!video) return stopScanner();
      video.srcObject = cameraStream;
      await video.play();
      state.scannerMessage = 'Cámara activa';
      renderScannerMessages();
      if (state.cameras.length > 1 && !document.querySelector('[data-camera-select]')) render();
      else detectFrames(video);
    } catch (error) {
      stopScanner();
      state.error = cameraError(error);
      state.scannerMessage = '';
      renderScannerMessages();
    }
  }

  function bind() {
    document.querySelector('[data-business-form="login"]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitEmployeeLogin(event.currentTarget);
    });
    document.querySelector('[data-business-form="code"]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      validateCode();
    });
    document.querySelector('#business-code')?.addEventListener('input', (event) => {
      const clean = event.currentTarget.value.replace(/\D/g, '').slice(0, 6);
      event.currentTarget.value = clean;
      state.code = clean;
      state.error = '';
      const button = event.currentTarget.form?.querySelector('[type="submit"]');
      if (button) button.disabled = clean.length !== 6;
      const error = document.querySelector('#business-error');
      if (error) error.textContent = '';
    });
    document.querySelector('[data-camera-select]')?.addEventListener('change', (event) => {
      state.selectedCamera = event.currentTarget.value;
      startScanner(state.selectedCamera);
    });
    document.querySelectorAll('[data-business-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.businessAction;
      if (action === 'open-scanner') { state.view = 'scanner'; state.error = ''; render(); }
      if (action === 'close-scanner') { stopScanner(); resetCustomer(); }
      if (action === 'cancel-preview' && !state.confirming) resetCustomer();
      if (action === 'confirm-stamp') confirmStamp();
      if (action === 'next-customer') resetCustomer();
      if (action === 'logout') {
        manualSignOut = true;
        stopScanner();
        mockEndLoyaltySimulation();
        try { await signOut(); } catch (error) { state.error = readableError(error); }
        state.employee = null;
        state.view = 'signedOut';
        render();
        manualSignOut = false;
      }
      if (action === 'retry-auth') restoreAccess();
      if (action === 'show-login') { state.employee = null; state.error = ''; state.view = 'signedOut'; render(); }
    }));
  }

  subscribeToAuthChanges((event) => {
    if (event !== 'SIGNED_OUT' || manualSignOut) return;
    const hadEmployee = Boolean(state.employee);
    stopScanner();
    mockEndLoyaltySimulation();
    state.employee = null;
    state.error = '';
    state.view = hadEmployee ? 'expired' : 'signedOut';
    render();
  });

  addEventListener('pagehide', stopScanner);
  addEventListener('beforeunload', stopScanner);
  restoreAccess();
}
