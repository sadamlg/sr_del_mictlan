import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountApiError } from '../src/lib/account-api.js';
import { loadAccountSession } from '../src/lib/account-session-state.js';

test('restores a public account from the HTTP-only session endpoint', async () => {
  const account = { id: 'account-1', firstName: 'Ana', email: 'ana@example.mx' };
  const state = await loadAccountSession(async (path) => {
    assert.equal(path, 'auth/session');
    return { account };
  });
  assert.deepEqual(state, { status: 'account', account, error: '' });
});

test('treats an absent or expired cookie as a guest session', async () => {
  const state = await loadAccountSession(async () => {
    throw new AccountApiError({ status: 401, error: { code: 'AUTHENTICATION_REQUIRED' } });
  });
  assert.deepEqual(state, { status: 'guest', account: null, error: '' });
});

test('keeps network failures distinct from an expired session so the UI can retry', async () => {
  const state = await loadAccountSession(async () => {
    throw new AccountApiError({ status: 0, error: { code: 'NETWORK_ERROR', message: 'Sin conexión.' } });
  });
  assert.deepEqual(state, { status: 'error', account: null, error: 'Sin conexión.' });
});
