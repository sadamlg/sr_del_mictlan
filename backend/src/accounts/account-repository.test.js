import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountRepository } from './account-repository.js';

const now = new Date('2026-11-14T12:00:00.000Z');

test('registration stores an unverified account and its confirmation job in one transaction', async () => {
  const calls = [];
  const transaction = {
    account: { create: async (input) => { calls.push(['account.create', input]); return { id: 'account-1', email: input.data.email }; } },
    emailJob: { create: async (input) => calls.push(['emailJob.create', input]) },
  };
  const repository = createAccountRepository({ $transaction: async (work) => work(transaction) });
  const result = await repository.createAccount({
    account: { email: 'ana@example.mx' }, passwordHash: 'scrypt-hash',
    emailJobType: 'ACCOUNT_CONFIRMATION', continueToCheckout: true,
  });
  assert.equal(result.email, 'ana@example.mx');
  assert.equal(calls[0][0], 'account.create');
  assert.equal(calls[0][1].data.passwordHash, 'scrypt-hash');
  assert.deepEqual(calls[1], ['emailJob.create', { data: {
    accountId: 'account-1', type: 'ACCOUNT_CONFIRMATION', continueToCheckout: true,
  } }]);
});

test('session lookup requires the matching token hash, an unrevoked row, and an unexpired timestamp', async () => {
  let query;
  const repository = createAccountRepository({
    accountSession: { findFirst: async (input) => { query = input; return { account: { id: 'account-1' } }; } },
  });
  await repository.findSessionByTokenHash('a'.repeat(64), now);
  assert.deepEqual(query.where, { tokenHash: 'a'.repeat(64), revokedAt: null, expiresAt: { gt: now } });
  assert.equal(query.include.account, true);
});

test('reset password claims the token once and revokes all sessions transactionally', async () => {
  const calls = [];
  const transaction = {
    accountToken: {
      findUnique: async () => ({ id: 'token-1', accountId: 'account-1', purpose: 'PASSWORD_RESET', consumedAt: null, expiresAt: new Date(now.getTime() + 1000) }),
      updateMany: async (input) => { calls.push(['token.updateMany', input]); return { count: 1 }; },
    },
    account: { update: async (input) => calls.push(['account.update', input]) },
    accountSession: { updateMany: async (input) => calls.push(['session.updateMany', input]) },
  };
  const repository = createAccountRepository({ $transaction: async (work) => work(transaction) });
  const result = await repository.resetPassword({ tokenHash: 'token-hash', passwordHash: 'new-hash', now });
  assert.equal(result, true);
  assert.equal(calls[0][0], 'token.updateMany');
  assert.deepEqual(calls[1], ['account.update', { where: { id: 'account-1' }, data: { passwordHash: 'new-hash' } }]);
  assert.deepEqual(calls.at(-1), ['session.updateMany', {
    where: { accountId: 'account-1', revokedAt: null }, data: { revokedAt: now },
  }]);
});

test('password reset validation checks only an unconsumed, unexpired token hash', async () => {
  let query;
  const repository = createAccountRepository({
    accountToken: { findFirst: async (input) => { query = input; return { id: 'token-1' }; } },
  });
  assert.equal(await repository.isPasswordResetTokenValid('hashed-token', now), true);
  assert.deepEqual(query, { where: {
    tokenHash: 'hashed-token', purpose: 'PASSWORD_RESET', consumedAt: null, expiresAt: { gt: now },
  }, select: { id: true } });
});

test('email confirmation claims the token once before changing the account email', async () => {
  const calls = [];
  const transaction = {
    accountToken: {
      findUnique: async () => ({
        id: 'token-1', accountId: 'account-1', purpose: 'EMAIL_CHANGE', consumedAt: null,
        expiresAt: new Date(now.getTime() + 1000), account: { id: 'account-1', pendingEmail: 'new@example.mx' },
      }),
      updateMany: async () => ({ count: 1 }),
    },
    account: { update: async (input) => calls.push(input) },
  };
  const repository = createAccountRepository({ $transaction: async (work) => work(transaction) });
  const result = await repository.confirmEmail('token-hash', now);
  assert.deepEqual(result, { purpose: 'EMAIL_CHANGE', accountId: 'account-1' });
  assert.deepEqual(calls[0], { where: { id: 'account-1' }, data: {
    email: 'new@example.mx', pendingEmail: null, emailVerifiedAt: now,
  } });
});

test('worker email job query omits password hashes and account addresses', async () => {
  let query;
  const repository = createAccountRepository({
    emailJob: { findUnique: async (input) => { query = input; return null; } },
  });
  await repository.getEmailJob('job-1');
  const accountSelection = query.select.account.select;
  assert.equal(accountSelection.firstName, true);
  assert.equal(accountSelection.email, true);
  assert.equal(accountSelection.pendingEmail, true);
  assert.equal('passwordHash' in accountSelection, false);
  assert.equal('street' in accountSelection, false);
});

test('email queue uses a skip-locked claim and increments its attempt under transaction', async () => {
  let queryCalled = false;
  const job = { id: 'job-1', accountId: 'account-1', type: 'ACCOUNT_CONFIRMATION', attempts: 1 };
  const repository = createAccountRepository({
    $transaction: async (work) => work({
      emailJob: { updateMany: async () => ({ count: 0 }) },
      $queryRaw: async (parts) => { queryCalled = parts.join('').includes('FOR UPDATE SKIP LOCKED'); return [job]; },
    }),
  });
  assert.deepEqual(await repository.claimNextEmailJob(now), job);
  assert.equal(queryCalled, true);
});
