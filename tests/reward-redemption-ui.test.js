import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('el cliente crea un canje sin descontarlo y muestra cuenta atrás', async () => {
  const [app, service] = await Promise.all([
    read('app.js'),
    read('services/stamp-session-service.js')
  ]);

  assert.match(app, /data-action="use-reward"/);
  assert.match(app, /createRewardRedemptionRequest/);
  assert.match(app, /data-stamp-countdown/);
  assert.match(service, /create_reward_redemption_request/);
  assert.match(service, /SPIRIT:REWARD:V1:/);
});

test('modo cafetería detecta el tipo y exige confirmación explícita', async () => {
  const business = await read('business/business-view.js');

  assert.match(business, /session\.type === 'reward_redemption'/);
  assert.match(business, /Vas a canjear 1 café gratuito/);
  assert.match(business, /Confirmar canje/);
  assert.match(business, /confirmRewardRedemptionSession/);
  assert.match(business, /Premio canjeado/);
});

test('el servicio usa la RPC transaccional separada para el canje', async () => {
  const service = await read('services/stamp-session-service.js');

  assert.match(service, /redeem_reward_session/);
  assert.match(service, /validate_loyalty_code/);
  assert.match(service, /validate_loyalty_qr/);
});
