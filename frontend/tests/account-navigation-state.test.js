import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reorderStateAfterNavigation,
  shouldResetAccountView,
  shouldResetAccountViewOnRestore,
} from '../src/lib/account-navigation-state.js';

function clickEvent(href, options = {}) {
  const anchor = {
    href,
    target: options.target || '',
    hasAttribute: (name) => name === 'download' && options.download === true,
  };
  return {
    target: { closest: (selector) => selector === 'a[href]' ? anchor : null },
    defaultPrevented: options.defaultPrevented || false,
    button: options.button ?? 0,
    ctrlKey: options.ctrlKey || false,
    metaKey: options.metaKey || false,
    shiftKey: options.shiftKey || false,
    altKey: options.altKey || false,
  };
}

test('clears account view state before same-tab navigation to another local route', () => {
  assert.equal(
    shouldResetAccountView(clickEvent('/cuenta/recuperar-contrasena'), 'http://shop.test/cuenta/iniciar-sesion'),
    true,
  );
});

test('keeps account view state for same route, external links, and new-tab actions', () => {
  const current = 'http://shop.test/cuenta/iniciar-sesion';
  assert.equal(shouldResetAccountView(clickEvent(current), current), false);
  assert.equal(shouldResetAccountView(clickEvent('https://other.test/help'), current), false);
  assert.equal(shouldResetAccountView(clickEvent('/cuenta/registro', { target: '_blank' }), current), false);
  assert.equal(shouldResetAccountView(clickEvent('/cuenta/registro', { ctrlKey: true }), current), false);
  assert.equal(shouldResetAccountView(clickEvent('/cuenta/registro', { download: true }), current), false);
});

test('clears an in-progress reorder when returning to the orders view', () => {
  const busy = { id: 'order-123', busy: true, error: '' };
  assert.deepEqual(reorderStateAfterNavigation(busy, 'history'), { id: '', busy: false, error: '' });
  assert.deepEqual(reorderStateAfterNavigation(busy, 'link'), { id: '', busy: false, error: '' });
  assert.equal(reorderStateAfterNavigation(busy, 'other'), busy);
});

test('resets the account view when the browser restores it from the back-forward cache', () => {
  assert.equal(shouldResetAccountViewOnRestore({ persisted: true }), true);
  assert.equal(shouldResetAccountViewOnRestore({ persisted: false }), false);
  assert.equal(shouldResetAccountViewOnRestore(undefined), false);
});
