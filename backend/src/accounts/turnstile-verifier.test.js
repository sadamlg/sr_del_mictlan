import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnstileVerifier, TurnstileUnavailableError } from './turnstile-verifier.js';

const success = (body) => ({ ok: true, json: async () => body });

test('validates Turnstile on the server and accepts the documented local test response', async () => {
  let request;
  const verify = createTurnstileVerifier({
    secretKey: '1x0000000000000000000000000000000AA',
    fetcher: async (...args) => { request = args; return success({ success: true, hostname: 'example.com' }); },
  });
  assert.equal(await verify('XXXX.DUMMY.TOKEN.XXXX', 'account_login'), true);
  assert.equal(request[0], 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(request[1].method, 'POST');
  assert.deepEqual(JSON.parse(request[1].body), {
    secret: '1x0000000000000000000000000000000AA', response: 'XXXX.DUMMY.TOKEN.XXXX',
  });
});

test('enforces action and expected hostname when configured for real keys', async () => {
  const valid = createTurnstileVerifier({
    secretKey: 'real-secret', expectedHostname: 'shop.example.mx', enforceContext: true,
    fetcher: async () => success({ success: true, hostname: 'shop.example.mx', action: 'account_register' }),
  });
  const wrongHost = createTurnstileVerifier({
    secretKey: 'real-secret', expectedHostname: 'shop.example.mx', enforceContext: true,
    fetcher: async () => success({ success: true, hostname: 'other.example.mx', action: 'account_register' }),
  });
  const wrongAction = createTurnstileVerifier({
    secretKey: 'real-secret', expectedHostname: 'shop.example.mx', enforceContext: true,
    fetcher: async () => success({ success: true, hostname: 'shop.example.mx', action: 'account_login' }),
  });
  assert.equal(await valid('token', 'account_register'), true);
  assert.equal(await wrongHost('token', 'account_register'), false);
  assert.equal(await wrongAction('token', 'account_register'), false);
});

test('rejects failed, malformed, or overlong tokens without contacting Siteverify', async () => {
  let calls = 0;
  const verify = createTurnstileVerifier({
    secretKey: 'test-secret', fetcher: async () => { calls += 1; return success({ success: false }); },
  });
  assert.equal(await verify('', 'account_login'), false);
  assert.equal(await verify('x'.repeat(2049), 'account_login'), false);
  assert.equal(await verify('token', 'account_login'), false);
  assert.equal(calls, 1);
});

test('fails closed when secret configuration or Siteverify is unavailable', async () => {
  const missing = createTurnstileVerifier({ secretKey: '', fetcher: async () => assert.fail('no request expected') });
  const unavailable = createTurnstileVerifier({ secretKey: 'secret', fetcher: async () => { throw new Error('network'); } });
  await assert.rejects(missing('token', 'account_login'), TurnstileUnavailableError);
  await assert.rejects(unavailable('token', 'account_login'), TurnstileUnavailableError);
});
