import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, POST } from '../src/app/api/backend/[...path]/route.js';

test('account proxy forwards only allowlisted paths, session cookies, origin, and no-cache responses', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.INTERNAL_API_URL;
  let captured;
  process.env.INTERNAL_API_URL = 'http://backend:3000';
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ account: { id: 'a1' } }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'mictlan_session=opaque; HttpOnly' } });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = originalUrl;
  });

  const request = new Request('http://shop.test/api/backend/auth/session', { headers: { Cookie: 'mictlan_session=opaque', Origin: 'http://shop.test' } });
  const response = await GET(request, { params: Promise.resolve({ path: ['auth', 'session'] }) });
  assert.equal(captured.url, 'http://backend:3000/api/auth/session');
  assert.equal(captured.options.headers.get('cookie'), 'mictlan_session=opaque');
  assert.equal(captured.options.headers.get('origin'), 'http://shop.test');
  assert.equal(captured.options.cache, 'no-store');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.deepEqual(await response.json(), { account: { id: 'a1' } });
});

test('account proxy refuses unlisted routes without contacting the internal API', async (context) => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('must not call'); };
  context.after(() => { globalThis.fetch = originalFetch; });
  const response = await POST(new Request('http://shop.test/api/backend/admin/secrets', { method: 'POST' }), {
    params: Promise.resolve({ path: ['admin', 'secrets'] }),
  });
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test('account proxy allows Checkout and reorder routes and preserves the Stripe return query', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.INTERNAL_API_URL;
  const forwarded = [];
  process.env.INTERNAL_API_URL = 'http://backend:3000';
  globalThis.fetch = async (url) => {
    forwarded.push(String(url));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = originalUrl;
  });

  const returnPath = ['checkout', 'return-status'];
  const returnResponse = await GET(new Request('http://shop.test/api/backend/checkout/return-status?session_id=cs_test_return'), {
    params: Promise.resolve({ path: returnPath }),
  });
  const checkoutResponse = await POST(new Request('http://shop.test/api/backend/checkout/sessions', { method: 'POST' }), {
    params: Promise.resolve({ path: ['checkout', 'sessions'] }),
  });
  const reorderResponse = await POST(new Request('http://shop.test/api/backend/orders/11111111-1111-4111-8111-111111111111/reorder', { method: 'POST' }), {
    params: Promise.resolve({ path: ['orders', '11111111-1111-4111-8111-111111111111', 'reorder'] }),
  });
  const catalogResponse = await GET(new Request('http://shop.test/api/backend/catalog/products'), {
    params: Promise.resolve({ path: ['catalog', 'products'] }),
  });

  assert.deepEqual([returnResponse.status, checkoutResponse.status, reorderResponse.status, catalogResponse.status], [200, 200, 200, 200]);
  assert.deepEqual(forwarded, [
    'http://backend:3000/api/checkout/return-status?session_id=cs_test_return',
    'http://backend:3000/api/checkout/sessions',
    'http://backend:3000/api/orders/11111111-1111-4111-8111-111111111111/reorder',
    'http://backend:3000/api/catalog/products',
  ]);
});

test('account proxy enforces methods for checkout routes and rejects malformed reorder paths', async (context) => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  context.after(() => { globalThis.fetch = originalFetch; });

  const wrongMethod = await GET(new Request('http://shop.test/api/backend/checkout/sessions'), {
    params: Promise.resolve({ path: ['checkout', 'sessions'] }),
  });
  const malformedReorder = await POST(new Request('http://shop.test/api/backend/orders/other/reorder', { method: 'POST' }), {
    params: Promise.resolve({ path: ['orders', 'other', 'reorder'] }),
  });
  assert.equal(wrongMethod.status, 404);
  assert.equal(malformedReorder.status, 404);
  assert.equal(called, false);
});
