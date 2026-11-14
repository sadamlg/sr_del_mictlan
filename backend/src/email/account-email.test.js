import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountEmail } from './account-email.js';
import { createAccountEmailWorker } from './account-email-worker.js';

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
  const worker = createAccountEmailWorker({
    repository,
    transport: { sendMail: async (message) => { sent = message; } },
    from: 'Señor del Mictlán <no-reply@local.test>',
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
  const worker = createAccountEmailWorker({
    repository: {
      claimNextEmailJob: async () => job,
      getEmailJob: async () => ({ ...job, account }),
      issueEmailToken: async () => ({ account, alreadyDone: false }),
      markEmailJobSent: async () => calls.push('sent'),
      markEmailJobFailed: async (input) => calls.push(input),
    },
    transport: { sendMail: async () => { throw Object.assign(new Error('to=ana@example.mx body=secret'), { code: 'ECONNECTION' }); } },
    from: 'no-reply@local.test', appBaseUrl: 'http://localhost:3000',
    now: () => new Date('2026-11-14T12:00:00Z'), tokenFactory: () => 'opaque-token',
    hashTokenValue: () => 'hashed-token',
    logger: { info() {}, error: (...args) => logs.push(args) },
  });
  assert.equal(await worker.processNext(), false);
  assert.equal(calls[0].errorCode, 'ECONNECTION');
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /ana@example.mx|secret|opaque-token/);
});
