export function createResendTransport(environment = process.env, request = fetch) {
  const apiKey = environment.RESEND_API_KEY;
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw Object.assign(new Error('Resend transport requires a Worker API key.'), { code: 'RESEND_API_KEY_MISSING' });
  }

  return {
    async sendMail(message) {
      const payload = {
        from: message.from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      };
      if (message.attachments?.length) {
        payload.attachments = message.attachments.map((attachment) => ({
          filename: attachment.filename,
          content: Buffer.from(attachment.content).toString('base64'),
        }));
      }

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (typeof message.idempotencyKey === 'string') headers['Idempotency-Key'] = message.idempotencyKey;

      let response;
      try {
        response = await request('https://api.resend.com/emails', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw Object.assign(new Error('Resend request failed.'), { code: 'RESEND_REQUEST_FAILED' });
      }
      if (!response.ok) {
        throw Object.assign(new Error('Resend rejected the email request.'), { code: `RESEND_HTTP_${response.status}` });
      }
      return { accepted: true };
    },
  };
}
