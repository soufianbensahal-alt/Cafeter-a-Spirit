import test from 'node:test';
import assert from 'node:assert/strict';
import {
  earnedRewardDelta,
  hasLoyaltyBalanceChanged,
  shouldStartPolling
} from '../services/loyalty-monitor.js';

test('detecta una confirmación aunque el módulo reinicie los sellos', () => {
  const request = { baselineStamps: 9, baselineRewards: 0 };
  const card = { currentStamps: 0, availableRewards: 1 };
  assert.equal(hasLoyaltyBalanceChanged(request, card), true);
  assert.equal(earnedRewardDelta(request, card), 1);
});

test('no cierra la solicitud si la tarjeta no ha cambiado', () => {
  const request = { baselineStamps: 4, baselineRewards: 1 };
  const card = { currentStamps: 4, availableRewards: 1 };
  assert.equal(hasLoyaltyBalanceChanged(request, card), false);
  assert.equal(earnedRewardDelta(request, card), 0);
});

test('el canje se confirma solamente cuando disminuye el saldo de recompensas', () => {
  const request = {
    type: 'reward_redemption',
    baselineStamps: 3,
    baselineRewards: 2
  };
  assert.equal(hasLoyaltyBalanceChanged(request, {
    currentStamps: 4,
    availableRewards: 2
  }), false);
  assert.equal(hasLoyaltyBalanceChanged(request, {
    currentStamps: 3,
    availableRewards: 1
  }), true);
});

test('activa polling sólo cuando Realtime falla o se cierra', () => {
  assert.equal(shouldStartPolling('SUBSCRIBED'), false);
  assert.equal(shouldStartPolling('CHANNEL_ERROR'), true);
  assert.equal(shouldStartPolling('TIMED_OUT'), true);
  assert.equal(shouldStartPolling('CLOSED'), true);
});
