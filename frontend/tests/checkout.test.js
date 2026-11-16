import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCheckoutTransferId,
  checkoutReturnMessage,
  checkoutReturnPollDelay,
  CHECKOUT_RETURN_MAX_ATTEMPTS,
  normalizeCheckoutRecipient,
  recipientFromAccount,
  validateCheckoutRecipient,
  validateHostedCheckoutUrl,
} from '../src/lib/checkout.js';

const validRecipient = {
  name: 'Ana Mora',
  email: 'ana@example.mx',
  address: {
    street: 'Hidalgo',
    number: '12',
    neighborhood: 'Centro',
    locality: 'Morelia',
    state: 'Michoacán',
    postalCode: '58000',
  },
};

test('checkout recipient starts from the account without sharing mutable address state', () => {
  const account = {
    firstName: 'Ana', lastName: 'Mora', email: 'ana@example.mx',
    address: { street: 'Hidalgo', number: '12', neighborhood: 'Centro', locality: 'Morelia', state: 'Michoacán', postalCode: '58000' },
  };
  const recipient = recipientFromAccount(account);
  recipient.address.street = 'Otra calle';
  assert.equal(account.address.street, 'Hidalgo');
  assert.deepEqual(recipientFromAccount(account), validRecipient);
});

test('checkout recipient normalization trims fields and validates postal code and email', () => {
  const normalized = normalizeCheckoutRecipient({
    ...validRecipient,
    name: '  Ana   Mora ',
    email: ' ANA@EXAMPLE.MX ',
    address: { ...validRecipient.address, street: '  Hidalgo  ' },
  });
  assert.deepEqual(normalized, { ...validRecipient, address: { ...validRecipient.address, street: 'Hidalgo' } });
  assert.deepEqual(validateCheckoutRecipient(normalized), {});

  const errors = validateCheckoutRecipient({ ...validRecipient, email: 'correo-invalido', address: { ...validRecipient.address, postalCode: '5800' } });
  assert.equal(errors.email, 'Escribe un correo válido.');
  assert.equal(errors['address.postalCode'], 'Escribe los cinco dígitos del código postal.');
});

test('checkout recipient rejects blank or oversized address fields', () => {
  const errors = validateCheckoutRecipient({
    ...validRecipient,
    name: ' ',
    address: { ...validRecipient.address, street: 'x'.repeat(121) },
  });
  assert.equal(errors.name, 'Completa el nombre de quien recibirá el pedido.');
  assert.equal(errors['address.street'], 'Completa este campo (máximo 120 caracteres).');
});

test('hosted checkout URL accepts only Stripe HTTPS destinations', () => {
  assert.equal(validateHostedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'), 'https://checkout.stripe.com/c/pay/cs_test_123');
  for (const url of [
    'http://checkout.stripe.com/c/pay/test',
    'https://checkout.stripe.com.attacker.example/c/pay/test',
    'https://user:pass@checkout.stripe.com/c/pay/test',
    'javascript:alert(1)',
  ]) assert.equal(validateHostedCheckoutUrl(url), null);
});

test('reorder idempotency token is a UUID from secure browser randomness', () => {
  const id = createCheckoutTransferId({ randomUUID: () => '22222222-2222-4222-8222-222222222222' });
  assert.equal(id, '22222222-2222-4222-8222-222222222222');
  assert.throws(() => createCheckoutTransferId({}), /segura/);
});

test('checkout return messages are driven by saved webhook status', () => {
  assert.match(checkoutReturnMessage('PENDING').message, /confirmación/);
  assert.equal(checkoutReturnMessage('PAID').kind, 'success');
  assert.match(checkoutReturnMessage('FAILED').message, /carrito sigue disponible/);
  assert.match(checkoutReturnMessage('NOT_FOUND').message, /No encontramos/);
});

test('checkout return polling backs off like the legacy flow and stops after twenty attempts', () => {
  assert.equal(CHECKOUT_RETURN_MAX_ATTEMPTS, 20);
  assert.equal(checkoutReturnPollDelay(1), 750);
  assert.equal(checkoutReturnPollDelay(2), 1500);
  assert.equal(checkoutReturnPollDelay(3), 3000);
  assert.equal(checkoutReturnPollDelay(20), 3000);
});
