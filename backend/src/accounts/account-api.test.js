import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { AccountError } from './account-service.js';

const publicAccount = {
  id: 'account-1', firstName: 'Ana', lastName: 'López', email: 'ana@example.mx', pendingEmail: null,
  emailVerified: true, dateOfBirth: '1990-01-01',
  address: { street: 'Calle Uno', number: '1', neighborhood: 'Centro', locality: 'Morelia', state: 'Michoacán', postalCode: '58000' },
};

async function withApi(service, callback) {
  const app = createApp({
    database: {
      $queryRaw: async () => [{ result: 1 }],
      order: { async findMany() { return []; } },
    },
    accountsService: service,
    verifyTurnstile: async () => true,
    environment: { FRONTEND_ORIGIN: 'http://shop.test', NODE_ENV: 'test' },
    logger: { error() {} },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function makeService(overrides = {}) {
  return {
    register: async (input) => ({ message: 'Revisa tu correo.', email: input.email }),
    login: async () => ({ account: publicAccount, sessionToken: 's'.repeat(43), expiresAt: new Date() }),
    logout: async () => {},
    getSession: async (token) => {
      if (token !== 's'.repeat(43)) throw new AccountError(401, 'AUTHENTICATION_REQUIRED', 'Inicia sesión para continuar.');
      return publicAccount;
    },
    requestPasswordReset: async () => ({ message: 'Si el correo tiene una cuenta, recibirás instrucciones.' }),
    resetPassword: async () => ({ message: 'Tu contraseña se actualizó.' }),
    validatePasswordResetToken: async () => ({ valid: false }),
    confirmEmail: async () => ({ message: 'Tu cuenta está activa.', accountActivated: true, sessionToken: 's'.repeat(43) }),
    getProfile: async () => publicAccount,
    updateProfile: async () => publicAccount,
    changePassword: async () => ({ message: 'Actualizamos tu contraseña.', sessionToken: 's'.repeat(43) }),
    ...overrides,
  };
}

test('allowed browser origin gets credentialed CORS on registration without setting a session', async () => {
  let received;
  await withApi(makeService({ register: async (input) => { received = input; return { message: 'Revisa tu correo.' }; } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { Origin: 'http://shop.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.mx', turnstileToken: 'dummy' }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://shop.test');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(received, { email: 'ana@example.mx' });
  });
});

test('preflight is limited to the configured frontend origin and rejects other origins', async () => {
  await withApi(makeService(), async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS', headers: { Origin: 'http://shop.test', 'Access-Control-Request-Method': 'POST' },
    });
    const rejected = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS', headers: { Origin: 'https://untrusted.test', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://shop.test');
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error.code, 'ORIGIN_NOT_ALLOWED');
  });
});

test('login cookie is HttpOnly, short-lived, and not present in JSON; session restores across requests', async () => {
  await withApi(makeService(), async (baseUrl) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { Origin: 'http://shop.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@example.mx', password: 'private', turnstileToken: 'dummy' }),
    });
    const cookie = login.headers.get('set-cookie');
    assert.equal(login.status, 200);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Max-Age=604800/);
    assert.doesNotMatch(JSON.stringify(await login.json()), /sessionToken|expiresAt/);

    const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: 'mictlan_session=' + 's'.repeat(43) } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).account.id, 'account-1');
    assert.equal(session.headers.get('cache-control'), 'no-store');
  });
});

test('private profile and orders require a session; orders never invent data', async () => {
  await withApi(makeService(), async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/api/orders`);
    const authenticated = await fetch(`${baseUrl}/api/orders`, { headers: { Cookie: 'mictlan_session=' + 's'.repeat(43) } });
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await authenticated.json(), { orders: [] });
    assert.equal(authenticated.headers.get('cache-control'), 'no-store');
  });
});

test('password reset token validation is public, opaque, and not cached', async () => {
  await withApi(makeService(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/password-reset-validations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'invalid' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { valid: false });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
