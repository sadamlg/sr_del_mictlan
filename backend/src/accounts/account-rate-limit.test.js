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

test('limits requests by connection address and path, then releases the slot after the window', () => {
  let now = 1000;
  const limit = createAccountRateLimit({ limit: 2, windowMs: 1000, now: () => now });
  const call = () => {
    let nextCalled = false;
    const response = responseProbe();
    limit({ path: '/api/auth/login', ip: '127.0.0.1', headers: { 'x-real-ip': '203.0.113.1' } }, response, () => { nextCalled = true; });
    return { response, nextCalled };
  };
  assert.equal(call().nextCalled, true);
  assert.equal(call().nextCalled, true);
  const rejected = call();
  assert.equal(rejected.response.statusCode, 429);
  assert.equal(rejected.response.headers['Retry-After'], '1');
  now += 1001;
  assert.equal(call().nextCalled, true);
});

test('does not allow client supplied forwarded addresses to allocate unbounded buckets', () => {
  const limit = createAccountRateLimit({ limit: 1, windowMs: 60_000, maxEntries: 1, now: () => 1 });
  let rejected = 0;
  const request = (ip, forwarded) => ({ path: '/api/auth/login', ip, headers: { 'x-real-ip': forwarded } });
  const run = (req) => limit(req, responseProbe(), () => {});
  run(request('127.0.0.1', '203.0.113.1'));
  const response = responseProbe();
  limit(request('127.0.0.1', '203.0.113.2'), response, () => { rejected += 1; });
  assert.equal(response.statusCode, 429);
  assert.equal(rejected, 0);
});
