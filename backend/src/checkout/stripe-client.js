import Stripe from 'stripe';

export function createStripeClient({ secretKey, mode = 'test' } = {}) {
  if (!secretKey) return null;
  if (typeof secretKey !== 'string' || !['test', 'live'].includes(mode)) {
    throw new Error('La configuración de Stripe no es válida.');
  }
  const expectedPrefix = mode === 'test' ? 'sk_test_' : 'sk_live_';
  if (!secretKey.startsWith(expectedPrefix)) {
    throw new Error(`STRIPE_SECRET_KEY debe usar una clave ${mode} de Stripe.`);
  }

  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
}
