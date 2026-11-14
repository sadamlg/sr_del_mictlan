import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_BYTES = 64;
const OPTIONS = { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_BYTES, OPTIONS);
  return ['scrypt', COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('hex'), key.toString('hex')].join('$');
}

export async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;
  const [algorithm, cost, blockSize, parallelization, saltHex, keyHex, extra] = encodedHash.split('$');
  if (
    algorithm !== 'scrypt' || cost !== String(COST) || blockSize !== String(BLOCK_SIZE)
    || parallelization !== String(PARALLELIZATION) || !/^[0-9a-f]{32}$/.test(saltHex ?? '')
    || !/^[0-9a-f]{128}$/.test(keyHex ?? '') || extra !== undefined
  ) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_BYTES, OPTIONS);
  return timingSafeEqual(actual, expected);
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  if (typeof token !== 'string') throw new TypeError('El token debe ser texto.');
  return createHash('sha256').update(token).digest('hex');
}
