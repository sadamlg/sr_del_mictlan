import assert from 'node:assert/strict';
import test from 'node:test';
import { createResendTransport } from './resend-transport.js';

test('Resend transport sends the purchase PDF by HTTPS and attaches an idempotency key', async () => {
  let request;
  const transport = createResendTransport({ RESEND_API_KEY: 're_unit_test_key' }, async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ id: 'resend-message-id' }) };
  });

  await transport.sendMail({
    from: 'Compras <compras@example.test>',
    to: 'buyer@example.test',
    subject: 'Pedido confirmado',
    text: 'Detalle adjunto',
    html: '<p>Confirmado</p>',
    idempotencyKey: 'purchase/e4a9ba92-b125-4a43-9a68-fb7e77f46e73',
    attachments: [{
      filename: 'pedido.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('%PDF-1.4'),
    }],
  });

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer re_unit_test_key');
  assert.equal(request.options.headers['Idempotency-Key'], 'purchase/e4a9ba92-b125-4a43-9a68-fb7e77f46e73');
  const payload = JSON.parse(request.options.body);
  assert.deepEqual(payload.to, ['buyer@example.test']);
  assert.deepEqual(payload.attachments, [{ filename: 'pedido.pdf', content: Buffer.from('%PDF-1.4').toString('base64') }]);
  assert.equal(payload.content, undefined);
});

test('Resend transport rejects missing credentials and does not expose provider response bodies', async () => {
  assert.throws(() => createResendTransport({}), { code: 'RESEND_API_KEY_MISSING' });

  const transport = createResendTransport({ RESEND_API_KEY: 're_unit_test_key' }, async () => ({
    ok: false,
    status: 503,
    text: async () => 'recipient=buyer@example.test message=private body',
  }));
  await assert.rejects(
    transport.sendMail({ from: 'sender@example.test', to: 'buyer@example.test', subject: 'Test', text: 'secret' }),
    (error) => error.code === 'RESEND_HTTP_503' && !error.message.includes('buyer@example.test') && !error.message.includes('private body'),
  );
});
