// Avisos físicos del panel de pedidos: sonido (Web Audio), vibración y
// pantalla siempre encendida (Screen Wake Lock).
//
// El estado que se muestra se calcula siempre a partir del AudioContext y del
// WakeLockSentinel reales, nunca a partir de «se pulsó el botón»: iOS/Safari
// suspende el audio al ocultar la pestaña y el sistema libera el wake lock en
// cualquier momento.

const defaultTone = (context, kind = 'new') => {
  const notes = kind === 'reminder' ? [880, 660] : kind === 'test' ? [660] : [660, 880, 1046];
  const start = context.currentTime + 0.02;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.18;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.17);
  });
};

export const VIBRATION_PATTERN = Object.freeze([220, 120, 220]);

// Resumen para el indicador y el botón «Activar avisos».
export function describeAlertStatus({ activated, audio, wakeLock }) {
  const audioRunning = audio === 'running';
  const screenOk = wakeLock === 'active' || wakeLock === 'unsupported';
  const needsActivation = !audioRunning && audio !== 'unsupported';
  return Object.freeze({
    activated: Boolean(activated),
    audio,
    wakeLock,
    soundReady: audioRunning,
    screenReady: screenOk,
    ready: audioRunning && screenOk,
    needsActivation,
    // Se activaron y se han perdido: el botón vuelve de forma destacada.
    lost: Boolean(activated) && needsActivation
  });
}

export function createOrderAlertDevice({
  AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext,
  wakeLock = globalThis.navigator?.wakeLock,
  vibrate = (pattern) => globalThis.navigator?.vibrate?.(pattern),
  visibilityTarget = globalThis.document,
  timers = globalThis,
  tone = defaultTone,
  resumeTimeoutMs = 1500,
  onChange = () => {}
} = {}) {
  let context = null;
  let sentinel = null;
  let wakeLockState = 'off';
  let activated = false;
  let destroyed = false;

  const audioState = () => {
    if (!AudioContextCtor) return 'unsupported';
    if (!context) return 'off';
    return context.state || 'suspended';
  };

  const status = () => describeAlertStatus({ activated, audio: audioState(), wakeLock: wakeLockState });
  const emit = () => { if (!destroyed) onChange(status()); };

  // resume() puede quedarse pendiente para siempre en Safari fuera de un gesto.
  const resumeWithTimeout = async () => {
    if (!context || context.state === 'running') return;
    let timer = 0;
    try {
      await Promise.race([
        Promise.resolve(context.resume()),
        new Promise((resolve) => { timer = timers.setTimeout(resolve, resumeTimeoutMs); })
      ]);
    } catch {
      // El estado real del contexto decide lo que se muestra.
    } finally {
      timers.clearTimeout(timer);
    }
  };

  const requestWakeLock = async () => {
    if (!wakeLock?.request) {
      wakeLockState = 'unsupported';
      return;
    }
    if (sentinel && !sentinel.released) {
      wakeLockState = 'active';
      return;
    }
    try {
      const acquired = await wakeLock.request('screen');
      sentinel = acquired;
      wakeLockState = 'active';
      acquired.addEventListener?.('release', () => {
        if (sentinel !== acquired) return;
        sentinel = null;
        wakeLockState = 'released';
        emit();
      });
    } catch {
      sentinel = null;
      wakeLockState = 'error';
    }
  };

  const ensureContext = () => {
    if (context || !AudioContextCtor) return;
    context = new AudioContextCtor();
    const handleState = () => emit();
    if (context.addEventListener) context.addEventListener('statechange', handleState);
    else context.onstatechange = handleState;
  };

  // Debe llamarse desde un gesto del usuario (clic en «Activar avisos»).
  const activate = async () => {
    ensureContext();
    await resumeWithTimeout();
    if (context?.state === 'running') {
      try { tone(context, 'test'); } catch { /* sin sonido de prueba */ }
    }
    await requestWakeLock();
    activated = true;
    emit();
    return status();
  };

  const handleVisibility = async () => {
    if (!activated || visibilityTarget?.visibilityState !== 'visible') return;
    await resumeWithTimeout();
    if (wakeLockState !== 'active' && wakeLockState !== 'unsupported') await requestWakeLock();
    emit();
  };
  visibilityTarget?.addEventListener?.('visibilitychange', handleVisibility);

  const alert = (kind = 'new') => {
    let sound = false;
    if (context?.state === 'running') {
      try {
        tone(context, kind);
        sound = true;
      } catch {
        sound = false;
      }
    }
    let vibrated = false;
    try { vibrated = Boolean(vibrate(VIBRATION_PATTERN)); } catch { vibrated = false; }
    return { sound, vibrated };
  };

  const destroy = () => {
    destroyed = true;
    visibilityTarget?.removeEventListener?.('visibilitychange', handleVisibility);
    const releasing = sentinel;
    sentinel = null;
    wakeLockState = 'off';
    try { releasing?.release?.(); } catch { /* ya liberado */ }
    try { context?.close?.(); } catch { /* ya cerrado */ }
    context = null;
    activated = false;
  };

  return {
    activate,
    alert,
    status,
    destroy,
    // Expuesto para tests y para reintentar tras visibilitychange.
    handleVisibility
  };
}
