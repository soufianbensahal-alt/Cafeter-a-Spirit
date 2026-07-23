import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readApp = () => readFile(new URL('../app.js', import.meta.url), 'utf8');

test('el historial traduce correctamente los canjes y el saldo restante', async () => {
  const app = await readApp();

  assert.match(app, /redeemedCoffee: 'Cafè gratuït bescanviat'/);
  assert.match(app, /oneRewardRemaining: '\{count\} recompensa restant'/);
  assert.match(app, /rewardsRemaining: '\{count\} recompenses restants'/);
  assert.match(app, /title: item\.type === 'stamp' \? t\('visitStamp'\) : t\('redeemedCoffee'\)/);
  assert.match(app, /t\(Number\(item\.availableRewards\) === 1 \? 'oneRewardRemaining' : 'rewardsRemaining'/);
  assert.doesNotMatch(app, /restante\(s\)/);
});

test('la recompensa procedente de Supabase se presenta en el idioma activo', async () => {
  const app = await readApp();

  assert.match(app, /freeCoffee: 'Cafè gratuït'/);
  assert.match(app, /localizedRewardDescription/);
  assert.match(app, /escapeHTML\(localizedRewardDescription\(state\.rewardDescription\)\)/);
  assert.match(app, /useFreeCoffee: 'Utilitzar el cafè gratuït'/);
  assert.match(app, /coffeesAvailable: '\{count\} cafès gratuïts disponibles'/);
});

test('los textos auxiliares del cliente también utilizan el diccionario', async () => {
  const app = await readApp();

  assert.match(app, /\$\{t\('loadMore'\)\}/);
  assert.match(app, /\$\{t\('completeProfile'\)\}/);
  assert.match(app, /aria-label="\$\{t\('authLabel'\)\}"/);
  assert.match(app, /placeholder="\$\{t\('emailPlaceholder'\)\}"/);
  assert.match(app, /alt="\$\{t\(isReward \? 'rewardQrAlt' : 'stampQrAlt'\)\}"/);
  assert.match(app, /stamp-request__security">\$\{t\('requestSecurity'\)\}/);
  assert.doesNotMatch(app, />Cargar más</);
  assert.doesNotMatch(app, />Completa tu nombre para personalizar Spirit</);
});

