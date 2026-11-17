import { createResendTransport } from './resend-transport.js';
import { createSmtpTransport } from './smtp-transport.js';

export function createEmailTransport(environment = process.env) {
  if (environment.EMAIL_TRANSPORT === 'smtp') return createSmtpTransport(environment);
  if (environment.EMAIL_TRANSPORT === 'resend') return createResendTransport(environment);
  throw Object.assign(new Error('EMAIL_TRANSPORT must be smtp or resend.'), { code: 'EMAIL_TRANSPORT_INVALID' });
}
