const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const REQUEST_TIMEOUT_MS = 5000;

export class TurnstileUnavailableError extends Error {
  constructor() {
    super('La verificación de seguridad no está disponible.');
    this.name = 'TurnstileUnavailableError';
  }
}

export function createTurnstileVerifier({
  secretKey = process.env.TURNSTILE_SECRET_KEY,
  expectedHostname,
  enforceContext = false,
  fetcher = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  return async function verifyTurnstileToken(token, expectedAction) {
    if (!secretKey) throw new TurnstileUnavailableError();
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let result;
    try {
      const response = await fetcher(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretKey, response: token }),
        signal: controller.signal,
      });
      if (!response?.ok) throw new TurnstileUnavailableError();
      result = await response.json();
    } catch {
      throw new TurnstileUnavailableError();
    } finally {
      clearTimeout(timeout);
    }

    if (!result || result.success !== true) return false;
    if (enforceContext && (result.hostname !== expectedHostname || result.action !== expectedAction)) return false;
    return true;
  };
}
