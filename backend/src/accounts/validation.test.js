import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  validatePasswordChangeInput,
  validateProfileInput,
  validateRegistrationInput,
} from './validation.js';

const TODAY = new Date('2026-11-14T12:00:00.000Z');
const validRegistration = {
  firstName: '  María   Elena ',
  lastName: '  López  Ruiz ',
  email: ' MARIA@example.mx ',
  dateOfBirth: '1990-06-12',
  password: 'una frase larga y privada',
  continueToCheckout: true,
  address: {
    street: ' Av. Morelos ', number: ' 18 ', neighborhood: ' Centro ',
    locality: ' Pátzcuaro ', state: ' Michoacán ', postalCode: '61600',
  },
};

test('normalizes names, email, and Mexican address while preserving checkout intent', () => {
  const result = validateRegistrationInput(validRegistration, TODAY);
  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    firstName: 'María Elena',
    lastName: 'López Ruiz',
    email: 'maria@example.mx',
    dateOfBirth: '1990-06-12',
    password: validRegistration.password,
    continueToCheckout: true,
    address: {
      street: 'Av. Morelos', number: '18', neighborhood: 'Centro',
      locality: 'Pátzcuaro', state: 'Michoacán', postalCode: '61600',
    },
  });
});

test('accepts the exact eighteenth birthday and rejects the day before it', () => {
  const exactBirthday = validateRegistrationInput({ ...validRegistration, dateOfBirth: '2008-11-14' }, TODAY);
  const oneDayYoung = validateRegistrationInput({ ...validRegistration, dateOfBirth: '2008-11-15' }, TODAY);
  assert.equal(exactBirthday.success, true);
  assert.equal(oneDayYoung.success, false);
  assert.match(oneDayYoung.errors.dateOfBirth, /18/);
});

test('rejects impossible and future birth dates', () => {
  for (const dateOfBirth of ['2000-02-30', '2026-11-15', '11/14/1990']) {
    const result = validateRegistrationInput({ ...validRegistration, dateOfBirth }, TODAY);
    assert.equal(result.success, false, dateOfBirth);
    assert.ok(result.errors.dateOfBirth, dateOfBirth);
  }
});

test('requires every Mexican address field and a five-digit postal code', () => {
  const missing = validateRegistrationInput({ ...validRegistration, address: { ...validRegistration.address, state: '' } }, TODAY);
  const malformed = validateRegistrationInput({ ...validRegistration, address: { ...validRegistration.address, postalCode: '6160A' } }, TODAY);
  assert.equal(missing.success, false);
  assert.ok(missing.errors['address.state']);
  assert.equal(malformed.success, false);
  assert.ok(malformed.errors['address.postalCode']);
});

test('rejects unexpected registration properties and passwords outside the contract', () => {
  assert.equal(validateRegistrationInput({ ...validRegistration, accountId: 'someone-else' }, TODAY).success, false);
  assert.equal(validateRegistrationInput({ ...validRegistration, continueToCheckout: 'https://example.test' }, TODAY).success, false);
  assert.ok(validateRegistrationInput({ ...validRegistration, password: 'short' }, TODAY).errors.password);
  assert.ok(validateRegistrationInput({ ...validRegistration, password: 'a'.repeat(129) }, TODAY).errors.password);
});

test('normalizes email before uniqueness checks', () => {
  assert.equal(normalizeEmail(' Person@Example.MX '), 'person@example.mx');
});

test('validates partial profile edits and rechecks adulthood and postal code', () => {
  assert.deepEqual(validateProfileInput({ firstName: ' Ana ' }, TODAY), {
    success: true, data: { firstName: 'Ana' },
  });
  assert.ok(validateProfileInput({ dateOfBirth: '2010-01-01' }, TODAY).errors.dateOfBirth);
  assert.ok(validateProfileInput({ address: { postalCode: '1234' } }, TODAY).errors['address.postalCode']);
  assert.ok(validateProfileInput({ unknown: 'field' }, TODAY).errors.input);
  assert.ok(validateProfileInput({}, TODAY).errors.input);
});

test('validates authenticated password changes', () => {
  const valid = validatePasswordChangeInput({ currentPassword: 'old private phrase', newPassword: 'another private phrase' });
  assert.equal(valid.success, true);
  assert.ok(validatePasswordChangeInput({ currentPassword: '', newPassword: 'short' }).errors.currentPassword);
  assert.ok(validatePasswordChangeInput({ currentPassword: 'old', newPassword: 'short' }).errors.newPassword);
});
