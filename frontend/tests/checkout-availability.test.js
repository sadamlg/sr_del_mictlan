import assert from 'node:assert/strict';
import test from 'node:test';
import { getAddToCartButtonState } from '../src/lib/checkout-availability.js';

test('add-to-cart button reflects Checkout availability', () => {
  assert.deepEqual(getAddToCartButtonState('enabled'), { enabled: true, label: 'Agregar al carrito' });
  assert.deepEqual(getAddToCartButtonState('disabled'), { enabled: false, label: 'Próximamente' });
  assert.deepEqual(getAddToCartButtonState('loading'), { enabled: false, label: 'Consultando…' });
  assert.deepEqual(getAddToCartButtonState('unavailable'), { enabled: false, label: 'No disponible' });
});

test('disabled cart actions explain whether the cart is loading, full, or unavailable', () => {
  assert.deepEqual(getAddToCartButtonState('disabled', { pending: true }), { enabled: false, label: 'Próximamente' });
  assert.deepEqual(getAddToCartButtonState('enabled', { hydrated: false }), { enabled: false, label: 'Cargando carrito…' });
  assert.deepEqual(getAddToCartButtonState('enabled', { isRestoring: true }), { enabled: false, label: 'Cargando carrito…' });
  assert.deepEqual(getAddToCartButtonState('enabled', { pending: true }), { enabled: false, label: 'Cargando carrito…' });
  assert.deepEqual(getAddToCartButtonState('enabled', { quantity: 99 }), { enabled: false, label: 'Límite alcanzado' });
});
