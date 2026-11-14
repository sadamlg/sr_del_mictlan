import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookie, readSessionCookie, SESSION_COOKIE_NAME } from './session-cookie.js';

test('reads only the opaque session cookie and does not accept a partial name match', () => {
  assert.equal(readSessionCookie({ headers: { cookie: 'theme=dark; mictlan_session=abc123; other=x' } }), 'abc123');
  assert.equal(readSessionCookie({ headers: { cookie: 'mictlan_session_extra=bad' } }), undefined);
  assert.equal(readSessionCookie({ headers: {} }), undefined);
});

test('sets bounded, HttpOnly, same-site cookies and adds Secure only for HTTPS', () => {
  const local = createSessionCookie('opaque-token', false);
  const secure = createSessionCookie('opaque-token', true);
  assert.match(local, new RegExp(`^${SESSION_COOKIE_NAME}=opaque-token;`));
  assert.match(local, /Path=\//);
  assert.match(local, /Max-Age=604800/);
  assert.match(local, /HttpOnly/);
  assert.match(local, /SameSite=Lax/);
  assert.doesNotMatch(local, /Secure/);
  assert.match(secure, /Secure/);
  assert.match(createSessionCookie('', true), /Max-Age=0/);
});
