import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRateLimit } from './account-rate-limit.js';

function responseProbe() {
  return {
    headers: {}, statusCode: 200, body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function makeRequest({ ip = '10.0.0.2', path = '/api/auth/login', body, headers = {} } = {}) {
  return { ip, path, body, headers, socket: { remoteAddress: ip } };
}

function run(limit, request) {
  const response = responseProbe();
  let nextCalled = false;
  limit(request, response, () => { nextCalled = true; });
  return { response, nextCalled };
}

test('separates accounts behind the same frontend proxy and limits one account across proxy addresses', () => {
  const rateLimit = createAccountRateLimit({ limit: 2, windowMs: 1000, now: () => 1000 });
  const login = (email, ip) => run(rateLimit, makeRequest({ ip, body: { email } }));

  assert.equal(login('ana@example.mx', '10.0.0.2').nextCalled, true);
  assert.equal(login('luis@example.mx', '10.0.0.2').nextCalled, true);
  assert.equal(login('ana@example.mx', '10.0.0.3').nextCalled, true);
  const rejected = login(' ANA@example.mx ', '10.0.0.4');

  assert.equal(rejected.response.statusCode, 429);
  assert.equal(rejected.response.headers['Retry-After'], '1');
});

test('changing an unverified cookie does not reset email-route quotas', () => {
  const rateLimit = createAccountRateLimit({ limit: 1, windowMs: 60_000, now: () => 1 });
  for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/password-reset-requests']) {
    const request = (cookie) => run(rateLimit, makeRequest({
      path, body: { email: 'ana@example.mx' }, headers: { cookie: `mictlan_session=${cookie}` },
    }));

    assert.equal(request('invented-one').nextCalled, true, path);
    assert.equal(request('invented-two').response.statusCode, 429, path);
  }
});

test('uses opaque tokens and authenticated session cookies as account identities', () => {
  const rateLimit = createAccountRateLimit({ limit: 1, windowMs: 60_000, now: () => 1 });
  const firstToken = run(rateLimit, makeRequest({ path: '/api/auth/password-resets', body: { token: 'token-one' } }));
  const otherToken = run(rateLimit, makeRequest({ path: '/api/auth/password-resets', body: { token: 'token-two' } }));
  const repeatedToken = run(rateLimit, makeRequest({ path: '/api/auth/password-resets', body: { token: 'token-one' } }));
  const firstSession = run(rateLimit, makeRequest({ path: '/api/profile/password', headers: { cookie: 'mictlan_session=session-one' } }));
  const otherSession = run(rateLimit, makeRequest({ path: '/api/profile/password', headers: { cookie: 'mictlan_session=session-two' } }));

  assert.equal(firstToken.nextCalled, true);
  assert.equal(otherToken.nextCalled, true);
  assert.equal(repeatedToken.response.statusCode, 429);
  assert.equal(firstSession.nextCalled, true);
  assert.equal(otherSession.nextCalled, true);
});

test('does not use client supplied forwarding headers as an identity', () => {
  const rateLimit = createAccountRateLimit({ limit: 1, windowMs: 60_000, now: () => 1 });
  const first = run(rateLimit, makeRequest({
    body: { email: 'ana@example.mx' }, headers: { 'x-forwarded-for': '203.0.113.1' },
  }));
  const spoofed = run(rateLimit, makeRequest({
    body: { email: 'ANA@example.mx' }, headers: { 'x-forwarded-for': '203.0.113.2' },
  }));

  assert.equal(first.nextCalled, true);
  assert.equal(spoofed.response.statusCode, 429);
});

test('evicts the oldest bucket at capacity instead of blocking every new identity', () => {
  let now = 1;
  const rateLimit = createAccountRateLimit({ limit: 1, windowMs: 60_000, maxEntries: 1, now: () => now });
  const first = run(rateLimit, makeRequest({ body: { email: 'ana@example.mx' } }));
  const second = run(rateLimit, makeRequest({ body: { email: 'luis@example.mx' } }));
  const secondAgain = run(rateLimit, makeRequest({ body: { email: 'luis@example.mx' } }));

  assert.equal(first.nextCalled, true);
  assert.equal(second.nextCalled, true);
  assert.equal(secondAgain.response.statusCode, 429);
});

test('releases an account bucket when the fixed window expires', () => {
  let now = 1000;
  const rateLimit = createAccountRateLimit({ limit: 1, windowMs: 1000, now: () => now });
  const request = makeRequest({ body: { email: 'ana@example.mx' } });

  assert.equal(run(rateLimit, request).nextCalled, true);
  assert.equal(run(rateLimit, request).response.statusCode, 429);
  now += 1001;
  assert.equal(run(rateLimit, request).nextCalled, true);
});
