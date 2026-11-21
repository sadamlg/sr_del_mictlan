import { isIP } from 'node:net';
import { createHmac, randomBytes } from 'node:crypto';
import { readSessionCookie } from './session-cookie.js';

function requestIdentity(request) {
  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body
    : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const token = typeof body.token === 'string' ? body.token : '';
  if (request.path.endsWith('/login') || request.path.endsWith('/register')
    || request.path.endsWith('/password-reset-requests')) {
    if (email) return `email:${email}`;
  } else if (token) {
    return `token:${token}`;
  }

  const session = readSessionCookie(request);
  if (session) return `session:${session}`;
  if (token) return `token:${token}`;

  const address = typeof request.ip === 'string' && isIP(request.ip)
    ? request.ip
    : isIP(request.socket?.remoteAddress ?? '') ? request.socket.remoteAddress : 'unknown';
  return `address:${address}`;
}

function opaqueIdentity(value, key) {
  return createHmac('sha256', key).update(value).digest('hex');
}

export function createAccountRateLimit({
  limit = 30,
  windowMs = 15 * 60 * 1000,
  maxEntries = 5000,
  now = Date.now,
} = {}) {
  const attempts = new Map();
  const identityKey = randomBytes(32);
  let nextCleanupAt = 0;

  function reject(response, retryAfterSeconds) {
    response.set('Cache-Control', 'no-store');
    response.set('Retry-After', String(Math.max(1, retryAfterSeconds)));
    return response.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Hiciste demasiados intentos. Espera un momento y vuelve a probar.' },
    });
  }

  return function accountRateLimit(request, response, next) {
    const timestamp = now();
    if (timestamp >= nextCleanupAt) {
      for (const [key, entry] of attempts) {
        if (entry.startedAt + windowMs <= timestamp) attempts.delete(key);
      }
      nextCleanupAt = timestamp + Math.min(windowMs, 60_000);
    }

    const key = `${opaqueIdentity(requestIdentity(request), identityKey)}:${request.path}`;
    const entry = attempts.get(key);
    if (!entry && attempts.size >= maxEntries) {
      attempts.delete(attempts.keys().next().value);
    }
    if (!entry || entry.startedAt + windowMs <= timestamp) {
      attempts.set(key, { startedAt: timestamp, count: 1 });
      return next();
    }
    attempts.delete(key);
    attempts.set(key, entry);
    if (entry.count >= limit) return reject(response, Math.ceil((entry.startedAt + windowMs - timestamp) / 1000));
    entry.count += 1;
    return next();
  };
}
