import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountEmail } from './account-email.js';
import { createEmailWorker } from './email-worker.js';

const account = { id: 'account-1', firstName: '<Ana & Luz>', email: 'ana@example.mx', pendingEmail: 'new@example.mx' };
const job = { id: 'job-1', accountId: 'account-1', type: 'ACCOUNT_CONFIRMATION', attempts: 1, continueToCheckout: true };

test('account confirmation email is branded, escapes user content, and retains only the fixed checkout flag', () => {
  const message = createAccountEmail({
    type: 'ACCOUNT_CONFIRMATION', account, token: 'opaque-token', continueToCheckout: true,
    appBaseUrl: 'http://localhost:3000',
  });
  assert.equal(message.subject, 'Activa tu cuenta | Señor del Mictlán');
  assert.match(message.text, /http:\/\/localhost:3000\/cuenta\/confirmar-correo\?token=opaque-token&continuar=checkout/);
  assert.match(message.html, /&lt;Ana &amp; Luz&gt;/);
  assert.doesNotMatch(message.html, /<Ana|<script/i);
  assert.match(message.text, /24 horas/);
});

test('email change and password reset use their own destinations and expirations', () => {
  const emailChange = createAccountEmail({ type: 'EMAIL_CHANGE_CONFIRMATION', account, token: 'change-token', appBaseUrl: 'http://localhost:3000' });
  const passwordReset = createAccountEmail({ type: 'PASSWORD_RESET', account, token: 'reset-token', appBaseUrl: 'http://localhost:3000' });
  assert.match(emailChange.text, /confirmar-correo\?token=change-token/);
  assert.match(emailChange.text, /new@example\.mx/);
  assert.match(emailChange.text, /24 horas/);
  assert.match(passwordReset.text, /restablecer-contrasena\?token=reset-token/);
  assert.match(passwordReset.text, /30 minutos/);
});

test('worker issues only a hashed token, sends locally, and marks the job sent', async () => {
  const calls = [];
  const repository = {
    claimNextEmailJob: async () => job,
    getEmailJob: async () => ({ ...job, account }),
    issueEmailToken: async (input) => { calls.push(['issue', input]); return { account, alreadyDone: false }; },
    markEmailJobSent: async (...args) => calls.push(['sent', ...args]),
    markEmailJobFailed: async (...args) => calls.push(['failed', ...args]),
  };
  let sent;
  const worker = createEmailWorker({
    repository,
    transport: { sendMail: async (message) => { sent = message; } },
    accountFrom: 'Señor del Mictlán <no-reply@local.test>',
    purchaseFrom: 'Compras <compras@local.test>',
    appBaseUrl: 'http://localhost:3000',
    now: () => new Date('2026-11-14T12:00:00Z'),
    tokenFactory: () => 'opaque-token',
    hashTokenValue: (value) => `sha256:${value}`,
    logger: { info() {}, error() {} },
  });
  assert.equal(await worker.processNext(), true);
  assert.equal(calls[0][0], 'issue');
  assert.equal(calls[0][1].tokenHash, 'sha256:opaque-token');
  assert.equal('token' in calls[0][1], false);
  assert.equal(sent.to, account.email);
  assert.match(sent.text, /continuar=checkout/);
  assert.equal(calls.at(-1)[0], 'sent');
});

test('worker schedules retry after delivery failure without logging the address or message', async () => {
  const calls = [];
  const logs = [];
  const worker = createEmailWorker({
    repository: {
      claimNextEmailJob: async () => job,
      getEmailJob: async () => ({ ...job, account }),
      issueEmailToken: async () => ({ account, alreadyDone: false }),
      markEmailJobSent: async () => calls.push('sent'),
      markEmailJobFailed: async (input) => calls.push(input),
    },
    transport: { sendMail: async () => { throw Object.assign(new Error('to=ana@example.mx body=secret'), { code: 'ECONNECTION' }); } },
    accountFrom: 'no-reply@local.test', purchaseFrom: 'compras@local.test', appBaseUrl: 'http://localhost:3000',
    now: () => new Date('2026-11-14T12:00:00Z'), tokenFactory: () => 'opaque-token',
    hashTokenValue: () => 'hashed-token',
    logger: { info() {}, error: (...args) => logs.push(args) },
  });
  assert.equal(await worker.processNext(), false);
  assert.equal(calls[0].errorCode, 'ECONNECTION');
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /ana@example.mx|secret|opaque-token/);
});

test('purchase worker sends one PDF from RESEND_FROM with a stable per-order idempotency key', async () => {
  const calls = [];
  const order = {
    id: 'order-paid-1', status: 'PAID', createdAt: new Date('2026-11-16T17:59:00Z'), paidAt: new Date('2026-11-16T18:00:00Z'),
    recipientName: 'Ana Mora', recipientEmail: 'buyer@example.test',
    shippingAddress: { street: 'Calle privada', number: '20', neighborhood: 'Centro', locality: 'Morelia', state: 'Michoacán', postalCode: '58000' },
    currency: 'MXN', subtotalCents: 25000, totalCents: 25000,
    items: [{ name: 'Calios', quantity: 1, unitPriceCents: 25000, lineTotalCents: 25000 }],
  };
  let sent;
  const worker = createEmailWorker({
    repository: {
      claimNextEmailJob: async () => ({ id: 'job-paid-1', orderId: order.id, type: 'PURCHASE_CONFIRMATION', attempts: 2 }),
      getEmailJob: async () => ({ order }),
      markEmailJobSent: async (...args) => calls.push(['sent', ...args]),
      markEmailJobFailed: async (input) => calls.push(['failed', input]),
    },
    transport: { sendMail: async (message) => { sent = message; } },
    accountFrom: 'Cuenta <cuenta@example.test>',
    purchaseFrom: 'Compras <compras@example.test>',
    appBaseUrl: 'https://store.example.test',
    logger: { info() {}, error() {} },
  });

  assert.equal(await worker.processNext(), true);
  assert.equal(sent.from, 'Compras <compras@example.test>');
  assert.equal(sent.to, order.recipientEmail);
  assert.equal(sent.attachments.length, 1);
  assert.equal(sent.attachments[0].content.subarray(0, 8).toString('ascii'), '%PDF-1.4');
  assert.equal(sent.idempotencyKey, `purchase/${order.id}`);
  assert.equal(calls[0][0], 'sent');
});

test('purchase delivery failure retries without logging the destination, address, token or message', async () => {
  const failed = [];
  const logs = [];
  const order = {
    id: 'order-sensitive-1', status: 'PAID', createdAt: new Date(), paidAt: new Date(),
    recipientName: 'Ana', recipientEmail: 'buyer@example.test',
    shippingAddress: { street: 'Calle secreta', number: '7', neighborhood: 'Centro', locality: 'Morelia', state: 'Michoacán', postalCode: '58000' },
    currency: 'MXN', subtotalCents: 10000, totalCents: 10000,
    items: [{ name: 'Private product', quantity: 1, unitPriceCents: 10000, lineTotalCents: 10000 }],
  };
  const worker = createEmailWorker({
    repository: {
      claimNextEmailJob: async () => ({ id: 'job-sensitive-1', type: 'PURCHASE_CONFIRMATION', attempts: 3 }),
      getEmailJob: async () => ({ order }),
      markEmailJobSent: async () => assert.fail('failed delivery must not mark SENT'),
      markEmailJobFailed: async (input) => failed.push(input),
    },
    transport: { sendMail: async () => { throw Object.assign(new Error('buyer@example.test Calle secreta private body token'), { code: 'ECONNECTION' }); } },
    accountFrom: 'account@example.test', purchaseFrom: 'sales@example.test',
    logger: { info() {}, error: (...args) => logs.push(args) },
  });

  assert.equal(await worker.processNext(), false);
  assert.equal(failed[0].errorCode, 'ECONNECTION');
  assert.equal(failed[0].attempts, 3);
  assert.doesNotMatch(JSON.stringify(logs), /buyer@example.test|Calle secreta|private body|token|Private product/);
});
