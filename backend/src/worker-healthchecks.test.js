import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkerHealthchecks } from './worker-healthchecks.js';

test('optional Worker check-in sends one Healthchecks signal per minute', async () => {
  let currentTime = 10_000;
  const requests = [];
  const sendPing = createWorkerHealthchecks({
    pingUrl: 'https://hc-ping.com/00000000-0000-0000-0000-000000000000',
    fetchImpl: async (url, options) => {
      requests.push({ url, method: options.method });
      return { ok: true };
    },
    now: () => currentTime,
  });

  assert.equal(await sendPing(), true);
  currentTime += 59_999;
  assert.equal(await sendPing(), false);
  currentTime += 1;
  assert.equal(await sendPing(), true);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ method }) => method), ['GET', 'GET']);
});

test('Healthchecks request failures are logged without throwing or exposing the ping URL', async () => {
  const warnings = [];
  const sendPing = createWorkerHealthchecks({
    pingUrl: 'https://hc-ping.com/secret-ping-token',
    fetchImpl: async () => { throw new Error('network error containing https://hc-ping.com/secret-ping-token'); },
    logger: { warn: (...entry) => warnings.push(entry) },
    now: () => 10_000,
  });

  assert.equal(await sendPing(), false);
  assert.equal(JSON.stringify(warnings).includes('secret-ping-token'), false);
  assert.deepEqual(warnings[0][1], { name: 'Error' });
});

test('missing check-in URL disables external pings', async () => {
  let requestCount = 0;
  const sendPing = createWorkerHealthchecks({ fetchImpl: async () => { requestCount += 1; } });

  assert.equal(await sendPing(), false);
  assert.equal(requestCount, 0);
});

test('rejects non-HTTPS or non-Healthchecks URLs', () => {
  assert.throws(() => createWorkerHealthchecks({ pingUrl: 'http://hc-ping.com/example' }), /HTTPS/);
  assert.throws(() => createWorkerHealthchecks({ pingUrl: 'https://example.com/ping' }), /Healthchecks/);
});
