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

export function createAccountRateLimit({
  limit = 30,
  windowMs = 15 * 60 * 1000,
  maxEntries = 5000,
  overflowSketchWidth = Math.max(1024, maxEntries * 4),
  now = Date.now,
} = {}) {
  const attempts = new Map();
  const identityKey = randomBytes(32);
  const overflowDepth = 4;
  const overflowBucketMs = Math.max(1, Math.ceil(windowMs / 15));
  const overflowBucketCount = Math.ceil(windowMs / overflowBucketMs) + 1;
  const CounterArray = limit < 65_535 ? Uint16Array : Uint32Array;
  const overflowCounterLimit = Math.min(limit + 1, 4_294_967_295);
  let overflowBuckets;
  let nextCleanupAt = 0;

  function overflowIndexes(identityDigest) {
    return Array.from({ length: overflowDepth }, (_, index) => (
      identityDigest.readUInt32LE(index * 4) % overflowSketchWidth
    ));
  }

  function getOverflowBucket(timestamp) {
    if (!overflowBuckets) overflowBuckets = Array(overflowBucketCount).fill(null);
    const epoch = Math.floor(timestamp / overflowBucketMs);
    const position = ((epoch % overflowBucketCount) + overflowBucketCount) % overflowBucketCount;
    let bucket = overflowBuckets[position];
    if (!bucket || bucket.epoch !== epoch) {
      bucket = {
        epoch,
        rows: Array.from({ length: overflowDepth }, () => new CounterArray(overflowSketchWidth)),
      };
      overflowBuckets[position] = bucket;
    }
    return bucket;
  }

  function overflowCount(indexes, timestamp) {
    if (!overflowBuckets) return 0;
    const oldestEpoch = Math.floor((timestamp - windowMs) / overflowBucketMs);
    const currentEpoch = Math.floor(timestamp / overflowBucketMs);
    const totals = Array(overflowDepth).fill(0);
    for (const bucket of overflowBuckets) {
      if (bucket && bucket.epoch >= oldestEpoch && bucket.epoch <= currentEpoch) {
        for (let row = 0; row < overflowDepth; row += 1) {
          totals[row] += bucket.rows[row][indexes[row]];
        }
      }
    }
    return Math.min(...totals);
  }

  function overflowRetryAfter(indexes, timestamp) {
    if (!overflowBuckets) return Math.ceil(windowMs / 1000);
    const oldestEpoch = Math.floor((timestamp - windowMs) / overflowBucketMs);
    const currentEpoch = Math.floor(timestamp / overflowBucketMs);
    const buckets = overflowBuckets
      .filter((bucket) => bucket && bucket.epoch >= oldestEpoch && bucket.epoch <= currentEpoch)
      .sort((left, right) => left.epoch - right.epoch);
    const totals = Array(overflowDepth).fill(0);
    for (const bucket of buckets) {
      for (let row = 0; row < overflowDepth; row += 1) {
        totals[row] += bucket.rows[row][indexes[row]];
      }
    }
    for (const bucket of buckets) {
      for (let row = 0; row < overflowDepth; row += 1) {
        totals[row] -= bucket.rows[row][indexes[row]];
      }
      if (Math.min(...totals) < limit) {
        const expiresAt = (bucket.epoch + 1) * overflowBucketMs + windowMs;
        return Math.max(1, Math.ceil((expiresAt - timestamp) / 1000));
      }
    }
    return Math.ceil(windowMs / 1000);
  }

  function incrementOverflow(indexes, timestamp) {
    const bucket = getOverflowBucket(timestamp);
    for (let row = 0; row < overflowDepth; row += 1) {
      const value = bucket.rows[row][indexes[row]];
      if (value < overflowCounterLimit) bucket.rows[row][indexes[row]] = value + 1;
    }
  }

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

    const identityDigest = createHmac('sha256', identityKey)
      .update(`${requestIdentity(request)}:${request.path}`)
      .digest();
    const key = identityDigest.toString('hex');
    const entry = attempts.get(key);
    if (entry && entry.startedAt + windowMs <= timestamp) {
      attempts.set(key, { startedAt: timestamp, count: 1 });
      return next();
    }
    if (entry) {
      if (entry.count >= limit) return reject(response, Math.ceil((entry.startedAt + windowMs - timestamp) / 1000));
      entry.count += 1;
      return next();
    }

    const indexes = overflowIndexes(identityDigest);
    const overflowAttempts = overflowCount(indexes, timestamp);
    if (overflowAttempts >= limit) return reject(response, overflowRetryAfter(indexes, timestamp));
    if (attempts.size < maxEntries && overflowAttempts === 0) {
      attempts.set(key, { startedAt: timestamp, count: 1 });
      return next();
    }

    // Keep exact active counters intact. A fixed-size sketch tracks identities that
    // overflow the exact map; collisions can only overcount and cause an early 429.
    incrementOverflow(indexes, timestamp);
    return next();
  };
}
