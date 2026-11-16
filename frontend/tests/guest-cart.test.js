import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addGuestCartItem,
  createCartTransferId,
  emptyGuestCart,
  GUEST_CART_STORAGE_KEY,
  GUEST_CART_TTL_MS,
  parseGuestCart,
  readGuestCart,
  updateGuestCart,
  writeGuestCart,
} from '../src/lib/guest-cart.js';

test('guest cart validates persisted items and expires 30 days after activity', () => {
  const now = 1_800_000_000_000;
  const saved = JSON.stringify({ items: [{ slug: 'mezcal-joven', quantity: 2 }], lastActivityAt: now - GUEST_CART_TTL_MS + 1 });
  assert.deepEqual(parseGuestCart(saved, now).items, [{ slug: 'mezcal-joven', quantity: 2 }]);
  assert.deepEqual(parseGuestCart(JSON.stringify({ items: [{ slug: 'mezcal-joven', quantity: 2 }], lastActivityAt: now - GUEST_CART_TTL_MS }), now), emptyGuestCart());
  assert.deepEqual(parseGuestCart(JSON.stringify({ items: [{ slug: 'Mezcal Joven', quantity: 2 }], lastActivityAt: now }), now), emptyGuestCart());
});

test('guest cart updates preserve one line per product and cap quantities at 99', () => {
  const cart = addGuestCartItem({ items: [{ slug: 'calios', quantity: 98 }], lastActivityAt: 10 }, 'calios', 10);
  assert.deepEqual(cart.items, [{ slug: 'calios', quantity: 99 }]);
  const removed = updateGuestCart(cart, 'calios', 0, 10);
  assert.deepEqual(removed.items, []);
  assert.ok(removed.lastActivityAt > cart.lastActivityAt);
});

test('guest storage failure keeps the cart usable in memory', () => {
  const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readGuestCart(brokenStorage), emptyGuestCart());
  const cart = addGuestCartItem(emptyGuestCart(), 'calios', 50);
  assert.equal(writeGuestCart(brokenStorage, cart), false);
  assert.deepEqual(cart.items, [{ slug: 'calios', quantity: 1 }]);
});

test('a guest transfer id stays stable for retries of the same snapshot', async () => {
  const snapshot = { items: [{ slug: 'calios', quantity: 2 }], lastActivityAt: 100 };
  const first = await createCartTransferId(snapshot);
  const retry = await createCartTransferId(snapshot);
  const changed = await createCartTransferId({ ...snapshot, lastActivityAt: 101 });
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(retry, first);
  assert.notEqual(changed, first);
});

test('storage serialization contains only slugs, quantities, and activity time', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const cart = addGuestCartItem(emptyGuestCart(), 'calios', 50);
  writeGuestCart(storage, cart);
  assert.equal([...data.keys()][0], GUEST_CART_STORAGE_KEY);
  assert.deepEqual(JSON.parse(data.get(GUEST_CART_STORAGE_KEY)), cart);
});
