const ADDRESS_FIELDS = ['street', 'number', 'neighborhood', 'locality', 'state', 'postalCode'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const CHECKOUT_RETURN_MAX_ATTEMPTS = 20;

export function isStripeCheckoutSessionId(value) {
  return typeof value === 'string' && value.length <= 255 && /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(value);
}

export function checkoutReturnPollDelay(attempt) {
  const retryNumber = Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
  return Math.min(750 * (2 ** Math.min(retryNumber - 1, 2)), 3000);
}

export function createCheckoutTransferId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('No se pudo preparar el reintento de forma segura.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function recipientFromAccount(account = {}) {
  return {
    name: [account.firstName, account.lastName].filter(Boolean).join(' '),
    email: account.email || '',
    address: Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, account.address?.[field] || ''])),
  };
}

export function normalizeCheckoutRecipient(recipient) {
  return {
    name: typeof recipient?.name === 'string' ? recipient.name.trim().replace(/\s+/g, ' ') : '',
    email: typeof recipient?.email === 'string' ? recipient.email.trim().toLowerCase() : '',
    address: Object.fromEntries(ADDRESS_FIELDS.map((field) => [
      field,
      typeof recipient?.address?.[field] === 'string' ? recipient.address[field].trim().replace(/\s+/g, ' ') : '',
    ])),
  };
}

export function validateCheckoutRecipient(value) {
  const recipient = normalizeCheckoutRecipient(value);
  const errors = {};
  if (!recipient.name || recipient.name.length > 255) errors.name = 'Completa el nombre de quien recibirá el pedido.';
  if (!EMAIL_PATTERN.test(recipient.email) || recipient.email.length > 254) errors.email = 'Escribe un correo válido.';
  for (const field of ADDRESS_FIELDS) {
    const fieldValue = recipient.address[field];
    if (!fieldValue || fieldValue.length > (field === 'postalCode' ? 5 : 120)) {
      errors[`address.${field}`] = 'Completa este campo (máximo 120 caracteres).';
    }
  }
  if (recipient.address.postalCode && !/^\d{5}$/.test(recipient.address.postalCode)) {
    errors['address.postalCode'] = 'Escribe los cinco dígitos del código postal.';
  }
  return errors;
}

export function validateHostedCheckoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function checkoutReturnMessage(status) {
  const messages = {
    PENDING: { kind: 'info', message: 'Estamos esperando la confirmación del pago para registrar tu pedido. Si acabas de pagar, no vuelvas a intentarlo; actualiza en unos minutos.' },
    PAID: { kind: 'success', message: 'Pago confirmado. Tu pedido aparece en esta lista.' },
    FAILED: { kind: 'error', message: 'El pago no se completó. Tu carrito sigue disponible para intentarlo de nuevo.' },
    EXPIRED: { kind: 'error', message: 'La sesión de pago venció. Tu carrito sigue disponible para continuar.' },
    NOT_FOUND: { kind: 'error', message: 'No encontramos una sesión de pago asociada a esta cuenta.' },
  };
  return messages[status] || messages.PENDING;
}
