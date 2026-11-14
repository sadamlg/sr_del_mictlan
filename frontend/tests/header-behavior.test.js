import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldHideHeaderOnScroll, shouldDisplayHeader, nextMenuState, getMenuToggleProps, getMobileNavigationProps, lockBodyScroll } from '../src/components/header/behavior.js';

test('el encabezado se oculta al bajar después de 80 px y reaparece al subir', () => {
  assert.equal(shouldHideHeaderOnScroll(80, 79), false);
  assert.equal(shouldHideHeaderOnScroll(81, 80), true);
  assert.equal(shouldHideHeaderOnScroll(80, 81), false);
  assert.equal(shouldDisplayHeader(false, true), true);
});

test('el menú se cierra al navegar o entrar a escritorio y expone su estado accesible', () => {
  assert.equal(nextMenuState(false, 'toggle'), true);
  assert.equal(nextMenuState(true, 'navigate'), false);
  assert.equal(nextMenuState(true, 'desktop'), false);
  assert.deepEqual(getMenuToggleProps(true), { 'aria-expanded': true, 'aria-label': 'Cerrar menú' });
  assert.deepEqual(getMobileNavigationProps(false), { 'aria-hidden': true, inert: true });
});

test('el bloqueo del desplazamiento restaura los valores anteriores', () => {
  const body = { style: { overflow: 'auto', touchAction: 'pan-y' } };
  const restore = lockBodyScroll(body);
  assert.deepEqual(body.style, { overflow: 'hidden', touchAction: 'none' });
  restore();
  assert.deepEqual(body.style, { overflow: 'auto', touchAction: 'pan-y' });
});
