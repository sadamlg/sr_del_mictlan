import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpaqueToken, hashPassword, hashToken, verifyPassword } from './crypto.js';

test('password hashes use independent salts and verify only the original password', async () => {
  const first = await hashPassword('a sufficiently long password');
  const second = await hashPassword('a sufficiently long password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a sufficiently long password', first), true);
  assert.equal(await verifyPassword('a different long password', first), false);
});

test('malformed password hashes fail closed', async () => {
  assert.equal(await verifyPassword('anything', 'not-a-scrypt-hash'), false);
  assert.equal(await verifyPassword('anything', undefined), false);
});

test('opaque tokens are 32-byte URL-safe values and stored as one-way hashes', () => {
  const token = createOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashToken(token).length, 64);
  assert.notEqual(hashToken(token), token);
  assert.notEqual(hashToken(createOpaqueToken()), hashToken(token));
});
