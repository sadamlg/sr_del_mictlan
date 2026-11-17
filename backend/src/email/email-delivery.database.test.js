import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import Stripe from 'stripe';
import { createAccountRepository } from '../accounts/account-repository.js';
import { createApp } from '../app.js';
import { createEmailWorker } from './email-worker.js';
import { createSmtpTransport } from './smtp-transport.js';

const frontendOrigin = 'http://store.example.test';
const webhookSecret = 'whsec_phase07_local_test';
const accountFrom = 'Señor del Mictlán <no-reply@local.test>';
const purchaseFrom = 'Señor del Mictlán · Compras <compras@local.test>';

function sentTo(message, address) {
  return (message.To ?? []).some((recipient) => (recipient.Address ?? recipient.Email ?? '') === address);
}

async function waitForMail(predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch('http://mailpit:8025/api/v1/messages?start=0&limit=100');
    assert.equal(response.ok, true);
    const result = await response.json();
    const message = (result.messages ?? []).find(predicate);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail('Timed out waiting for a local Mailpit message.');
}

async function readMailpitMessage(id) {
  const response = await fetch(`http://mailpit:8025/api/v1/message/${encodeURIComponent(id)}`);
  assert.equal(response.ok, true);
  return response.json();
}

async function deliverNext(worker) {
  assert.equal(await worker.processNext(), true);
}

test('Compose API and PostgreSQL deliver account, recovery, and paid-order email with a single PDF; retries recover', async (context) => {
  if (process.env.EMAIL_DELIVERY_DATABASE_TEST !== '1') {
    context.skip('Activa EMAIL_DELIVERY_DATABASE_TEST=1 en el backend de Compose.');
    return;
  }

  const { prisma } = await import('../database/prisma-client.js');
  const accountIdCandidate = randomUUID();
  const productSlug = `phase07-${randomUUID().replaceAll('-', '')}`;
  const email = `phase07-${accountIdCandidate}@example.test`;
  const firstPassword = 'phase07-initial-passphrase';
  const newPassword = 'phase07-recovered-passphrase';
  const stripe = new Stripe('sk_test_phase07_local');
  stripe.customers.update = async () => {};
  let sessionParams;
  stripe.checkout.sessions.create = async (params) => {
    sessionParams = params;
    return { id: 'cs_test_phase07_purchase', url: 'https://checkout.stripe.com/c/pay/cs_test_phase07_purchase' };
  };
  const smtpTransport = createSmtpTransport({ SMTP_HOST: 'mailpit', SMTP_PORT: 1025 });
  const repository = createAccountRepository(prisma);
  const emailWorker = createEmailWorker({
    repository,
    transport: smtpTransport,
    accountFrom,
    purchaseFrom,
    appBaseUrl: frontendOrigin,
    logger: { info() {}, error() {} },
  });
  let server;
  let createdAccountId;
  let productId;

  try {
    const app = createApp({
      database: prisma,
      mediaBaseUrl: 'http://localhost:3000',
      allowInsecureDevHttp: true,
      environment: { FRONTEND_ORIGIN: frontendOrigin, NODE_ENV: 'test' },
      secureCookies: false,
      verifyTurnstile: async () => true,
      stripe,
      stripeWebhookSecret: webhookSecret,
    });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const apiUrl = `http://127.0.0.1:${server.address().port}`;
    const jsonHeaders = { Origin: frontendOrigin, 'Content-Type': 'application/json' };

    const registration = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({
        firstName: 'Prueba Fase 07', lastName: 'Cuenta Local', email,
        dateOfBirth: '1990-04-12', password: firstPassword, turnstileToken: 'local-test-token',
        address: { street: 'Calle Roble', number: '18', neighborhood: 'Centro', locality: 'Morelia', state: 'Michoacán', postalCode: '58000' },
      }),
    });
    assert.equal(registration.status, 201);
    const registeredAccount = await prisma.account.findUnique({ where: { email }, select: { id: true } });
    createdAccountId = registeredAccount.id;
    await deliverNext(emailWorker);
    const confirmationMessage = await waitForMail((message) => message.Subject?.includes('Activa tu cuenta') && sentTo(message, email));
    const confirmation = await readMailpitMessage(confirmationMessage.ID);
    const confirmationToken = confirmation.Text.match(/confirmar-correo\?token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(confirmationToken);
    assert.equal(/Activar mi cuenta/.test(confirmation.Text), true);
    assert.equal(/continuar=checkout/.test(confirmation.Text), false);

    const confirmed = await fetch(`${apiUrl}/api/auth/email-confirmations`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token: confirmationToken }),
    });
    assert.equal(confirmed.status, 200);
    const cookie = confirmed.headers.get('set-cookie')?.split(';', 1)[0];
    assert.match(cookie ?? '', /^mictlan_session=/);

    const resetRequest = await fetch(`${apiUrl}/api/auth/password-reset-requests`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email }),
    });
    assert.equal(resetRequest.status, 202);
    await deliverNext(emailWorker);
    const resetMessage = await waitForMail((message) => message.Subject?.includes('Restablece tu contraseña') && sentTo(message, email));
    const resetMail = await readMailpitMessage(resetMessage.ID);
    const resetToken = resetMail.Text.match(/restablecer-contrasena\?token=([A-Za-z0-9_-]{43})/)?.[1];
    assert.ok(resetToken);
    const reset = await fetch(`${apiUrl}/api/auth/password-resets`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token: resetToken, password: newPassword }),
    });
    assert.equal(reset.status, 200);
    const login = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ email, password: newPassword, turnstileToken: 'local-test-token' }),
    });
    assert.equal(login.status, 200);
    const activeCookie = login.headers.get('set-cookie')?.split(';', 1)[0];

    const product = await prisma.product.create({ data: {
      slug: productSlug, name: 'Mezcal Calios', description: 'Producto local de prueba.',
      priceCents: 25000, imageKey: `catalog/${productSlug}/front.webp`, imageAlt: 'Botella de prueba',
      lifestyleImageKey: `catalog/${productSlug}/context.webp`, labelOne: 'Agave de prueba',
      labelTwo: 'Perfil herbal', active: true,
    } });
    productId = product.id;
    await prisma.accountCartItem.create({ data: { accountId: createdAccountId, productId, quantity: 1 } });
    const checkout = await fetch(`${apiUrl}/api/checkout/sessions`, {
      method: 'POST', headers: { Cookie: activeCookie, Origin: frontendOrigin },
    });
    assert.equal(checkout.status, 201);
    assert.equal((await checkout.json()).checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_phase07_purchase');
    const orderId = sessionParams.metadata.orderId;
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    const payload = JSON.stringify({
      id: 'evt_phase07_purchase', object: 'event', type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test_phase07_purchase', object: 'checkout.session', mode: 'payment', payment_status: 'paid',
        amount_total: 25000, currency: 'mxn', client_reference_id: order.id,
        metadata: { orderId: order.id }, payment_intent: 'pi_phase07_purchase', customer: 'cus_phase07_test',
      } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const webhook = () => fetch(`${apiUrl}/api/webhooks/stripe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload,
    });
    assert.equal((await webhook()).status, 200);
    assert.equal((await webhook()).status, 200);
    assert.equal(await prisma.emailJob.count({ where: { orderId } }), 1);
    await deliverNext(emailWorker);
    const purchaseMessage = await waitForMail((message) => message.Subject?.includes('Tu compra está confirmada') && sentTo(message, email));
    const purchaseMail = await readMailpitMessage(purchaseMessage.ID);
    assert.equal(purchaseMail.Attachments.length, 1);
    assert.equal(purchaseMail.Attachments[0].FileName, `detalle-pedido-${orderId}.pdf`);
    const attachmentResponse = await fetch(`http://mailpit:8025/api/v1/message/${encodeURIComponent(purchaseMessage.ID)}/part/${encodeURIComponent(purchaseMail.Attachments[0].PartID)}`);
    assert.equal(attachmentResponse.ok, true);
    const pdf = Buffer.from(await attachmentResponse.arrayBuffer());
    assert.equal(pdf.subarray(0, 8).toString('ascii'), '%PDF-1.4');
    assert.equal(/Mezcal Calios/.test(pdf.toString('latin1')), true);
    assert.equal((await prisma.emailJob.findUnique({ where: { orderId } })).status, 'SENT');

    const failedReset = await fetch(`${apiUrl}/api/auth/password-reset-requests`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email }),
    });
    assert.equal(failedReset.status, 202);
    const logs = [];
    const failingWorker = createEmailWorker({
      repository,
      transport: { async sendMail() { throw Object.assign(new Error(`${email} Calle Roble message body token`), { code: 'SMTP_TEST_FAILURE' }); } },
      accountFrom, purchaseFrom, appBaseUrl: frontendOrigin,
      logger: { info() {}, error: (...args) => logs.push(args) },
    });
    assert.equal(await failingWorker.processNext(), false);
    const retryJob = await prisma.emailJob.findFirst({
      where: { accountId: createdAccountId, type: 'PASSWORD_RESET', status: 'RETRY' },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(retryJob.attempts, 1);
    assert.equal(retryJob.lastError, 'SMTP_TEST_FAILURE');
    assert.ok(retryJob.nextAttemptAt > new Date());
    const serializedLogs = JSON.stringify(logs);
    const logsContainSensitiveData = [email, 'Calle Roble', 'message body', 'token'].some((value) => serializedLogs.includes(value));
    assert.equal(logsContainSensitiveData, false);
    await prisma.emailJob.update({ where: { id: retryJob.id }, data: { nextAttemptAt: new Date() } });
    await deliverNext(emailWorker);
    const recoveredJob = await prisma.emailJob.findUnique({ where: { id: retryJob.id } });
    assert.equal(recoveredJob.status, 'SENT');
    assert.equal(recoveredJob.attempts, 2);
    const recoveredMessage = await waitForMail((message) => message.Subject?.includes('Restablece tu contraseña') && sentTo(message, email));
    assert.ok(recoveredMessage.ID);

    const staleJob = await prisma.emailJob.create({ data: {
      accountId: createdAccountId,
      type: 'ACCOUNT_CONFIRMATION',
      status: 'PROCESSING',
      attempts: 1,
      lockedAt: new Date(Date.now() - 10 * 60 * 1000),
    } });
    assert.equal(await emailWorker.processNext(), true);
    const reclaimedJob = await prisma.emailJob.findUnique({ where: { id: staleJob.id } });
    assert.equal(reclaimedJob.status, 'SENT');
    assert.equal(reclaimedJob.attempts, 2);
  } finally {
    server?.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    smtpTransport.close();
    if (createdAccountId) await prisma.account.deleteMany({ where: { id: createdAccountId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }
});
