import assert from 'node:assert/strict';
import test from 'node:test';
import { fromIsoMexicanDate, hasFormChanges, isOpaqueTokenShape, toIsoMexicanDate, validateRegistrationForm } from '../src/lib/account-form.js';

const valid = {
  firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.mx', dateOfBirth: '01/05/1990', password: 'una-clave-muy-segura',
  street: 'Hidalgo', number: '12', neighborhood: 'Centro', locality: 'Morelia', state: 'Michoacán', postalCode: '58000',
};

test('registration form accepts complete values and reports required, email, zip, and password errors', () => {
  assert.deepEqual(validateRegistrationForm(valid), {});
  const errors = validateRegistrationForm({ ...valid, firstName: ' ', email: 'correo-mal', postalCode: '5800', password: 'corta' });
  assert.equal(errors.firstName, 'Completa este campo.');
  assert.equal(errors.email, 'Escribe un correo válido.');
  assert.equal(errors.postalCode, 'Escribe los cinco dígitos del código postal.');
  assert.equal(errors.password, 'Usa entre 12 y 128 caracteres.');
});

test('profile change check detects edits in nested Mexican address fields', () => {
  const initial = { firstName: 'Ana', address: { street: 'Hidalgo', postalCode: '58000' } };
  assert.equal(hasFormChanges(initial, structuredClone(initial)), false);
  assert.equal(hasFormChanges(initial, { ...initial, address: { ...initial.address, postalCode: '58100' } }), true);
});

test('opaque account link token shape requires 32-byte base64url encoding', () => {
  assert.equal(isOpaqueTokenShape('a'.repeat(43)), true);
  assert.equal(isOpaqueTokenShape('short'), false);
  assert.equal(isOpaqueTokenShape('a'.repeat(42) + '!'), false);
});

test('Mexican date input round-trips DD/MM/YYYY and rejects impossible calendar dates', () => {
  assert.equal(toIsoMexicanDate('14/11/2026'), '2026-11-14');
  assert.equal(fromIsoMexicanDate('2026-11-14'), '14/11/2026');
  assert.equal(toIsoMexicanDate('31/02/2026'), '');
  assert.equal(toIsoMexicanDate('2026-11-14'), '');
});
