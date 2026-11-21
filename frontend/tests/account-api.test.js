import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  AccountApiError,
  accountRequest,
  resolveAccountRequestUrl,
} from '../src/lib/account-api.js';

test('account API selects local direct access in development and same-origin proxy in production', () => {
  assert.equal(resolveAccountRequestUrl('auth/login', {
    apiBaseUrl: 'http://localhost:4000/', nodeEnv: 'development',
  }), 'http://localhost:4000/api/auth/login');
  assert.equal(resolveAccountRequestUrl('/profile', { nodeEnv: 'production' }), '/api/backend/profile');
  assert.equal(resolveAccountRequestUrl('orders', {
    apiProxyPath: '/custom-proxy/', nodeEnv: 'production',
  }), '/custom-proxy/orders');
});

test('account requests include credentials, avoid caching, and serialize JSON bodies', async (context) => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { status: 200, ok: true, json: async () => ({ message: 'ok' }) };
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  await accountRequest('auth/login', { method: 'POST', body: { email: 'ana@example.mx' } });
  assert.equal(captured.url, 'http://localhost:4000/api/auth/login');
  assert.equal(captured.options.credentials, 'include');
  assert.equal(captured.options.cache, 'no-store');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
  assert.equal(captured.options.body, JSON.stringify({ email: 'ana@example.mx' }));
});

test('the hydrated session provider reuses the request started before hydration', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const response = { status: 200, ok: true, json: async () => ({ account: null }) };
  globalThis.window = { __mictlanSessionBootstrapResponse: Promise.resolve(response) };
  globalThis.fetch = async () => assert.fail('no debe duplicar la consulta de sesión');
  context.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });

  assert.deepEqual(await accountRequest('auth/session'), { account: null });
  assert.equal(globalThis.window.__mictlanSessionBootstrapResponse, undefined);
});

test('a timed out pre-hydration session request keeps the timeout error for the account UI', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const timeoutError = new Error('timed out');
  timeoutError.name = 'TimeoutError';
  globalThis.window = { __mictlanSessionBootstrapResponse: Promise.reject(timeoutError) };
  globalThis.fetch = async () => assert.fail('no debe repetir una consulta que ya excedió el tiempo');
  context.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });

  await assert.rejects(accountRequest('auth/session'), (error) => {
    assert.equal(error.code, 'REQUEST_TIMEOUT');
    return true;
  });
});

test('structured API errors preserve field validation and status for form views', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 422, ok: false,
    json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Revisa tus datos.', fields: { postalCode: 'Cinco dígitos.' } } }),
  });
  context.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(accountRequest('auth/register', { method: 'POST', body: {} }), (error) => {
    assert.ok(error instanceof AccountApiError);
    assert.equal(error.status, 422);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.fields.postalCode, 'Cinco dígitos.');
    return true;
  });
});

test('expired sessions on protected cart, checkout, and order requests refresh the shared session', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () => ({
    status: 401, ok: false,
    json: async () => ({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Inicia sesión para continuar.' } }),
  });
  context.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });

  const protectedPaths = ['cart/account', 'checkout/sessions', 'orders', 'orders/22222222-2222-4222-8222-222222222222/reorder'];
  for (const [index, path] of protectedPaths.entries()) {
    await assert.rejects(accountRequest(path, { method: 'POST', body: {} }), (error) => error.status === 401);
    assert.deepEqual(events, Array(index + 1).fill(ACCOUNT_SESSION_CHANGED_EVENT));
  }
});

test('an invalid login response does not trigger a session refresh loop', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () => ({
    status: 401, ok: false,
    json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Revisa tus datos.' } }),
  });
  context.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });

  await assert.rejects(accountRequest('auth/login', { method: 'POST', body: {} }), (error) => error.status === 401);
  assert.deepEqual(events, []);
});

test('204 responses skip JSON parsing and session mutations notify the shared provider', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () => ({ status: 204, ok: true, json: async () => assert.fail('no response body expected') });
  context.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });

  assert.equal(await accountRequest('auth/logout', { method: 'POST' }), null);
  assert.deepEqual(events, [ACCOUNT_SESSION_CHANGED_EVENT]);
});

test('password reset notifies the session provider after revoking sessions', async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ message: 'actualizada' }) });
  context.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });

  await accountRequest('auth/password-resets', { method: 'POST', body: { token: 'opaque' } });
  assert.deepEqual(events, [ACCOUNT_SESSION_CHANGED_EVENT]);
});

test('network and timeout errors are converted to safe user-facing API errors', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('private transport detail'); };
  context.after(() => { globalThis.fetch = originalFetch; });
  await assert.rejects(accountRequest('auth/session'), (error) => {
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.doesNotMatch(error.message, /private transport detail/);
    return true;
  });
});
