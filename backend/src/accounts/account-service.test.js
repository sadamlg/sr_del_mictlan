import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountService } from './account-service.js';

const token = 'a'.repeat(43);
const account = {
  id: 'account-1', firstName: 'María', lastName: 'López', email: 'maria@example.mx',
  pendingEmail: null, passwordHash: 'stored-hash', emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  dateOfBirth: new Date('1990-06-12T00:00:00Z'), street: 'Av. Morelos', number: '18',
  neighborhood: 'Centro', locality: 'Pátzcuaro', state: 'Michoacán', postalCode: '61600',
};
const registration = {
  firstName: 'María', lastName: 'López', email: ' MARIA@example.mx ', dateOfBirth: '1990-06-12',
  password: 'a sufficiently long password', continueToCheckout: true,
  address: { street: 'Av. Morelos', number: '18', neighborhood: 'Centro', locality: 'Pátzcuaro', state: 'Michoacán', postalCode: '61600' },
};

function makeService(overrides = {}) {
  const calls = [];
  const repository = {
    createAccount: async (input) => { calls.push(['createAccount', input]); return { email: input.account.email }; },
    findAccountByEmail: async () => account,
    findAccountById: async () => account,
    findAccountByEmailForUpdate: async () => null,
    createSession: async (input) => { calls.push(['createSession', input]); },
    findSessionByTokenHash: async () => ({ account, tokenHash: 'hash' }),
    revokeSession: async (...args) => calls.push(['revokeSession', ...args]),
    enqueuePasswordReset: async (...args) => calls.push(['enqueuePasswordReset', ...args]),
    resetPassword: async (...args) => { calls.push(['resetPassword', ...args]); return true; },
    isPasswordResetTokenValid: async (...args) => { calls.push(['isPasswordResetTokenValid', ...args]); return true; },
    changePassword: async (...args) => calls.push(['changePassword', ...args]),
    confirmEmail: async () => ({ purpose: 'ACCOUNT_CONFIRMATION', accountId: account.id }),
    updateProfile: async ({ accountId, updates, pendingEmail, emailJobType }) => {
      calls.push(['updateProfile', { accountId, updates, pendingEmail, emailJobType }]);
      return { ...account, ...updates, pendingEmail: pendingEmail ?? account.pendingEmail };
    },
    listPaidOrders: async () => [],
    ...overrides.repository,
  };
  const tokenValues = [token, 'b'.repeat(43), 'c'.repeat(43)];
  const service = createAccountService({
    repository,
    now: () => new Date('2026-11-14T12:00:00.000Z'),
    tokenFactory: () => tokenValues.shift() ?? token,
    hashTokenValue: (value) => `hash:${value}`,
    hashPasswordValue: async (value) => `hashed:${value}`,
    verifyPasswordValue: async (value, stored) => stored === `hashed:${value}` || value === 'correct current password' && stored === 'stored-hash',
    ...overrides,
  });
  return { service, repository, calls };
}

test('register normalizes input, hashes the password, queues confirmation, and creates no session', async () => {
  const { service, calls } = makeService();
  const result = await service.register(registration);
  const [, input] = calls.find(([name]) => name === 'createAccount');
  assert.equal(input.account.email, 'maria@example.mx');
  assert.equal(input.account.firstName, 'María');
  assert.equal(input.passwordHash, `hashed:${registration.password}`);
  assert.equal(input.emailJobType, 'ACCOUNT_CONFIRMATION');
  assert.equal(input.continueToCheckout, true);
  assert.equal(calls.some(([name]) => name === 'createSession'), false);
  assert.match(result.message, /correo/i);
});

test('rejects underage registration before writing to the repository', async () => {
  const { service, calls } = makeService();
  await assert.rejects(service.register({ ...registration, dateOfBirth: '2010-01-01' }), (error) => {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.fields.dateOfBirth);
    return true;
  });
  assert.equal(calls.length, 0);
});

test('login creates a bounded hashed session and returns only public account fields', async () => {
  const { service, calls } = makeService();
  const result = await service.login({ email: ' MARIA@example.mx ', password: 'correct current password' });
  assert.equal(result.sessionToken, token);
  assert.equal(result.expiresAt.toISOString(), '2026-11-21T12:00:00.000Z');
  assert.equal(result.account.email, 'maria@example.mx');
  assert.equal(result.account.dateOfBirth, '1990-06-12');
  assert.equal('passwordHash' in result.account, false);
  assert.deepEqual(calls.find(([name]) => name === 'createSession')[1], {
    accountId: account.id, tokenHash: `hash:${token}`, expiresAt: result.expiresAt,
  });
});

test('login uses a generic credential error for unknown account and incorrect password', async () => {
  const unknown = makeService({ repository: { findAccountByEmail: async () => null } });
  const wrongPassword = makeService();
  for (const current of [unknown, wrongPassword]) {
    await assert.rejects(current.service.login({ email: 'maria@example.mx', password: 'incorrect password' }), (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.code, 'INVALID_CREDENTIALS');
      assert.match(error.message, /correo o la contraseña/i);
      return true;
    });
  }
});

test('an unverified account cannot start a session', async () => {
  const pending = { ...account, emailVerifiedAt: null };
  const { service, calls } = makeService({ repository: { findAccountByEmail: async () => pending } });
  await assert.rejects(service.login({ email: pending.email, password: 'correct current password' }), (error) => {
    assert.equal(error.code, 'EMAIL_NOT_VERIFIED');
    return true;
  });
  assert.equal(calls.some(([name]) => name === 'createSession'), false);
});

test('email confirmation activates a new account and starts a session', async () => {
  const { service, calls } = makeService();
  const result = await service.confirmEmail({ token });
  assert.equal(result.accountActivated, true);
  assert.equal(result.sessionToken, token);
  assert.equal(calls.find(([name]) => name === 'createSession')[1].tokenHash, `hash:${token}`);
});

test('email confirmation rejects invalid, expired, or already consumed links', async () => {
  const { service } = makeService({ repository: { confirmEmail: async () => false } });
  await assert.rejects(service.confirmEmail({ token }), (error) => error.code === 'EMAIL_CONFIRMATION_INVALID');
  await assert.rejects(service.confirmEmail({ token: 'short' }), (error) => error.status === 400);
});

test('password reset request has a generic response for every syntactically valid email', async () => {
  const { service, calls } = makeService();
  const result = await service.requestPasswordReset({ email: ' UNKNOWN@example.mx ' });
  assert.match(result.message, /si el correo tiene una cuenta/i);
  assert.deepEqual(calls.find(([name]) => name === 'enqueuePasswordReset')[1], 'unknown@example.mx');
});

test('password reset delegates only a token hash and password hash, rejecting a reused token', async () => {
  let input;
  const { service } = makeService({ repository: { resetPassword: async (value) => { input = value; return true; } } });
  await service.resetPassword({ token, password: 'a replacement password' });
  assert.equal(input.tokenHash, `hash:${token}`);
  assert.equal(input.passwordHash, 'hashed:a replacement password');
  assert.deepEqual(input.now, new Date('2026-11-14T12:00:00.000Z'));
  const expired = makeService({ repository: { resetPassword: async () => false } });
  await assert.rejects(expired.service.resetPassword({ token, password: 'a replacement password' }), (error) => error.code === 'RESET_LINK_INVALID');
});

test('password reset link validation returns one boolean and sends only a token hash to storage', async () => {
  const { service, calls } = makeService();
  assert.deepEqual(await service.validatePasswordResetToken({ token }), { valid: true });
  assert.deepEqual(calls.find(([name]) => name === 'isPasswordResetTokenValid'), [
    'isPasswordResetTokenValid', `hash:${token}`, new Date('2026-11-14T12:00:00.000Z'),
  ]);
  assert.deepEqual(await service.validatePasswordResetToken({ token: 'invalid' }), { valid: false });
});

test('profile email changes require the current password and remain pending', async () => {
  const { service, calls } = makeService();
  const result = await service.updateProfile(account.id, { email: 'new@example.mx', currentPassword: 'correct current password' });
  assert.equal(result.email, account.email);
  assert.equal(result.pendingEmail, 'new@example.mx');
  assert.deepEqual(calls.find(([name]) => name === 'updateProfile')[1], {
    accountId: account.id, updates: {}, pendingEmail: 'new@example.mx', emailJobType: 'EMAIL_CHANGE_CONFIRMATION',
  });
});

test('profile email changes reject an incorrect current password', async () => {
  const { service } = makeService();
  await assert.rejects(service.updateProfile(account.id, { email: 'new@example.mx', currentPassword: 'wrong password' }), (error) => error.code === 'INVALID_CREDENTIALS');
});

test('authenticated password changes rotate the session and pass hashes to persistence', async () => {
  const { service, calls } = makeService();
  const result = await service.changePassword(account.id, {
    currentPassword: 'correct current password', newPassword: 'a different long password',
  });
  assert.equal(result.sessionToken, token);
  assert.equal(result.message.includes('demás sesiones'), true);
  assert.deepEqual(calls.find(([name]) => name === 'changePassword')[1], {
    accountId: account.id,
    passwordHash: 'hashed:a different long password',
    tokenHash: `hash:${token}`,
    expiresAt: new Date('2026-11-21T12:00:00.000Z'),
    now: new Date('2026-11-14T12:00:00.000Z'),
  });
});

test('session restoration derives the account from the opaque session and returns public fields only', async () => {
  const { service } = makeService();
  const restored = await service.getSession(token);
  assert.equal(restored.id, account.id);
  assert.equal('passwordHash' in restored, false);
  await assert.rejects(service.getSession('invalid'), (error) => error.status === 401);
});

test('Mis pedidos returns an empty list when there are no persisted paid orders', async () => {
  const { service } = makeService();
  assert.deepEqual(await service.listOrders(account.id), []);
});
