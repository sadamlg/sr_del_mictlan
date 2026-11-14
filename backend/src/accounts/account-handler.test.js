import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountHandlers } from './account-handler.js';
import { AccountError } from './account-service.js';
import { TurnstileUnavailableError } from './turnstile-verifier.js';

function responseProbe() {
  return {
    statusCode: null, body: null, headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end() { this.ended = true; return this; },
  };
}

test('registration verifies Turnstile, strips its token, and does not issue a cookie', async () => {
  let input;
  let verified;
  const handlers = createAccountHandlers({ register: async (value) => { input = value; return { message: 'Revisa tu correo.' }; } }, {
    verifyTurnstile: async (value, action) => { verified = [value, action]; return true; },
  });
  const response = responseProbe();
  await handlers.register({ body: { email: 'ana@example.mx', turnstileToken: 'challenge-token' } }, response);
  assert.deepEqual(verified, ['challenge-token', 'account_register']);
  assert.deepEqual(input, { email: 'ana@example.mx' });
  assert.equal(response.statusCode, 201);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal('Set-Cookie' in response.headers, false);
});

test('missing or invalid Turnstile tokens block account operations before service calls', async () => {
  let calls = 0;
  const handlers = createAccountHandlers({ register: async () => { calls += 1; } }, {
    verifyTurnstile: async () => false,
  });
  for (const body of [{ email: 'ana@example.mx' }, { email: 'ana@example.mx', turnstileToken: 'bad' }]) {
    const response = responseProbe();
    await handlers.register({ body }, response);
    assert.equal(response.statusCode, 403);
    assert.ok(['TURNSTILE_REQUIRED', 'TURNSTILE_INVALID'].includes(response.body.error.code));
  }
  assert.equal(calls, 0);
});

test('login sends the opaque session only as an HttpOnly cookie and strips it from JSON', async () => {
  const handlers = createAccountHandlers({
    login: async () => ({ account: { id: 'account-1', firstName: 'Ana' }, sessionToken: 's'.repeat(43), expiresAt: new Date() }),
  }, { secureCookies: true, verifyTurnstile: async () => true });
  const response = responseProbe();
  await handlers.login({ body: { email: 'ana@example.mx', password: 'private', turnstileToken: 'token' } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.account.firstName, 'Ana');
  assert.equal('sessionToken' in response.body, false);
  assert.equal('expiresAt' in response.body, false);
  assert.match(response.headers['Set-Cookie'], /HttpOnly/);
  assert.match(response.headers['Set-Cookie'], /Secure/);
});

test('logout revokes the presented session and expires its cookie', async () => {
  let received;
  const handlers = createAccountHandlers({ logout: async (value) => { received = value; } });
  const response = responseProbe();
  await handlers.logout({ headers: { cookie: `mictlan_session=${'s'.repeat(43)}` } }, response);
  assert.equal(received, 's'.repeat(43));
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.match(response.headers['Set-Cookie'], /Max-Age=0/);
});

test('password reset link check returns a generic valid flag with no account details', async () => {
  let input;
  const handlers = createAccountHandlers({ validatePasswordResetToken: async (value) => { input = value; return { valid: false }; } });
  const response = responseProbe();
  await handlers.validatePasswordResetToken({ body: { token: 'unusable-token' } }, response);
  assert.deepEqual(input, { token: 'unusable-token' });
  assert.deepEqual(response.body, { valid: false });
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('returns structured account and infrastructure errors without leaking internals', async () => {
  const messages = [];
  const handlers = createAccountHandlers({
    login: async () => { throw new AccountError(401, 'INVALID_CREDENTIALS', 'El correo o la contraseña no son correctos.'); },
    register: async () => { throw new TurnstileUnavailableError(); },
  }, { verifyTurnstile: async () => true, logger: { error: (...args) => messages.push(args) } });
  const invalid = responseProbe();
  await handlers.login({ body: { email: 'ana@example.mx', password: 'private', turnstileToken: 'token' } }, invalid);
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.body.error.code, 'INVALID_CREDENTIALS');
  const unavailable = responseProbe();
  await handlers.register({ body: { email: 'ana@example.mx', turnstileToken: 'token' } }, unavailable);
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.body.error.code, 'TURNSTILE_UNAVAILABLE');
  assert.equal(messages.length, 0);
  assert.doesNotMatch(JSON.stringify(unavailable.body), /private|token/i);
});

test('unexpected errors log only the error type and code', async () => {
  let logged;
  const handlers = createAccountHandlers({ session: async () => { throw new Error('password=secret'); } }, {
    logger: { error: (...args) => { logged = args; } },
  });
  const response = responseProbe();
  await handlers.session({ headers: {} }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, 'ACCOUNT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(logged), /secret|password=/i);
});
