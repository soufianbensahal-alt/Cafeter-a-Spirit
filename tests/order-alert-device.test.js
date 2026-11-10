import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderAlertDevice, describeAlertStatus } from '../services/order-alert-device.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

// AudioContext simulado: resume() se comporta según `resumeMode`.
function fakeAudio({ initial = 'suspended', resumeMode = 'ok' } = {}) {
  const instances = [];
  class FakeAudioContext extends EventTarget {
    constructor() {
      super();
      this.state = initial;
      this.closed = false;
      instances.push(this);
    }
    setState(state) {
      this.state = state;
      this.dispatchEvent(new Event('statechange'));
    }
    resume() {
      if (FakeAudioContext.resumeMode === 'ok') { this.setState('running'); return Promise.resolve(); }
      if (FakeAudioContext.resumeMode === 'reject') return Promise.reject(new Error('NotAllowedError'));
      if (FakeAudioContext.resumeMode === 'noop') return Promise.resolve();
      return new Promise(() => {}); // 'hang': Safari fuera de un gesto
    }
    close() { this.closed = true; this.state = 'closed'; }
  }
  FakeAudioContext.resumeMode = resumeMode;
  return { FakeAudioContext, instances };
}

function fakeWakeLock({ fail = false } = {}) {
  const sentinels = [];
  return {
    sentinels,
    request: async (type) => {
      assert.equal(type, 'screen');
      if (fail) throw new Error('NotAllowedError');
      const sentinel = Object.assign(new EventTarget(), {
        released: false,
        release() { this.released = true; this.dispatchEvent(new Event('release')); }
      });
      sentinels.push(sentinel);
      return sentinel;
    }
  };
}

const immediateTimers = { setTimeout: (fn) => { setImmediate(fn); return 1; }, clearTimeout: () => {} };

function setup({ audio = fakeAudio(), wakeLock = fakeWakeLock(), vibrate = () => true } = {}) {
  const changes = [];
  const tones = [];
  const visibilityTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const device = createOrderAlertDevice({
    AudioContextCtor: audio.FakeAudioContext,
    wakeLock,
    vibrate,
    visibilityTarget,
    timers: immediateTimers,
    tone: (_context, kind) => tones.push(kind),
    onChange: (status) => changes.push(status)
  });
  return { device, audio, wakeLock, changes, tones, visibilityTarget };
}

test('antes de activar: avisos desactivados y botón visible', () => {
  const { device } = setup();
  const status = device.status();
  assert.equal(status.audio, 'off');
  assert.equal(status.ready, false);
  assert.equal(status.needsActivation, true);
  assert.equal(status.lost, false, 'sin activar no se muestra como perdido');
});

test('activar desbloquea el audio, pide wake lock y suena una prueba', async () => {
  const { device, tones, wakeLock } = setup();
  const status = await device.activate();
  assert.equal(status.audio, 'running');
  assert.equal(status.wakeLock, 'active');
  assert.equal(status.ready, true);
  assert.equal(status.needsActivation, false);
  assert.deepEqual(tones, ['test']);
  assert.equal(wakeLock.sentinels.length, 1);
});

test('el indicador refleja el estado real: si el sistema suspende el audio, deja de estar activo', async () => {
  const { device, audio, changes } = setup();
  await device.activate();
  audio.instances[0].setState('suspended');
  const last = changes.at(-1);
  assert.equal(last.ready, false);
  assert.equal(last.soundReady, false);
  assert.equal(last.lost, true, 'se activó y se ha perdido: el botón vuelve destacado');
  // iOS usa 'interrupted' durante una llamada.
  audio.instances[0].setState('interrupted');
  assert.equal(changes.at(-1).lost, true);
});

test('visibilitychange: si el audio está suspendido intenta resume() y vuelve a estar activo', async () => {
  const { device, audio, visibilityTarget, changes } = setup();
  await device.activate();
  audio.instances[0].setState('suspended');
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  await flush();
  await flush();
  assert.equal(changes.at(-1).audio, 'running');
  assert.equal(changes.at(-1).lost, false);
});

for (const mode of ['reject', 'noop', 'hang']) {
  test(`visibilitychange: si resume() falla (${mode}) vuelve a pedir «Activar avisos» de forma destacada`, async () => {
    const audio = fakeAudio();
    const { device, visibilityTarget, changes } = setup({ audio });
    await device.activate();
    audio.FakeAudioContext.resumeMode = mode;
    audio.instances[0].setState('suspended');
    visibilityTarget.dispatchEvent(new Event('visibilitychange'));
    await flush();
    await flush();
    await flush();
    const last = changes.at(-1);
    assert.equal(last.audio, 'suspended');
    assert.equal(last.needsActivation, true);
    assert.equal(last.lost, true);
    assert.equal(last.ready, false);
  });
}

test('visibilitychange a oculto no intenta nada', async () => {
  const { device, audio, visibilityTarget } = setup();
  await device.activate();
  audio.instances[0].setState('suspended');
  visibilityTarget.visibilityState = 'hidden';
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(audio.instances[0].state, 'suspended');
});

test('el wake lock liberado por el sistema se refleja y se recupera al volver a la pestaña', async () => {
  const { device, wakeLock, visibilityTarget, changes } = setup();
  await device.activate();
  wakeLock.sentinels[0].release();
  assert.equal(changes.at(-1).wakeLock, 'released');
  assert.equal(changes.at(-1).ready, false, 'sin wake lock no se muestran los avisos como completos');
  assert.equal(changes.at(-1).soundReady, true);
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  await flush();
  await flush();
  assert.equal(wakeLock.sentinels.length, 2);
  assert.equal(changes.at(-1).wakeLock, 'active');
  assert.equal(changes.at(-1).ready, true);
});

test('sin Wake Lock (navegador no compatible) el sonido basta para estar activo', async () => {
  const { device } = setup({ wakeLock: null });
  const status = await device.activate();
  assert.equal(status.wakeLock, 'unsupported');
  assert.equal(status.ready, true);
});

test('si el wake lock se deniega, se muestra el error', async () => {
  const { device } = setup({ wakeLock: fakeWakeLock({ fail: true }) });
  const status = await device.activate();
  assert.equal(status.wakeLock, 'error');
  assert.equal(status.ready, false);
});

test('si activar no consigue el audio (sin gesto), el botón sigue visible', async () => {
  const audio = fakeAudio({ resumeMode: 'hang' });
  const { device, tones } = setup({ audio });
  const status = await device.activate();
  assert.equal(status.soundReady, false);
  assert.equal(status.needsActivation, true);
  assert.deepEqual(tones, [], 'no intenta sonar con el contexto suspendido');
});

test('alert suena solo con el contexto en marcha y siempre intenta vibrar', async () => {
  const vibrations = [];
  const { device, tones, audio } = setup({ vibrate: (pattern) => { vibrations.push(pattern); return true; } });
  assert.deepEqual(device.alert('new'), { sound: false, vibrated: true });
  await device.activate();
  assert.deepEqual(device.alert('new'), { sound: true, vibrated: true });
  assert.deepEqual(device.alert('reminder'), { sound: true, vibrated: true });
  audio.instances[0].setState('suspended');
  assert.equal(device.alert('new').sound, false);
  assert.deepEqual(tones, ['test', 'new', 'reminder']);
  assert.equal(vibrations.length, 4);
});

test('destroy libera el wake lock, cierra el audio y deja de escuchar la visibilidad', async () => {
  const { device, wakeLock, audio, visibilityTarget, changes } = setup();
  await device.activate();
  device.destroy();
  assert.equal(wakeLock.sentinels[0].released, true);
  assert.equal(audio.instances[0].closed, true);
  const count = changes.length;
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(changes.length, count);
});

test('describeAlertStatus: audio no disponible no pide activación', () => {
  const status = describeAlertStatus({ activated: false, audio: 'unsupported', wakeLock: 'off' });
  assert.equal(status.needsActivation, false);
  assert.equal(status.ready, false);
});
