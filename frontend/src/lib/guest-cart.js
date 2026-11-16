export const GUEST_CART_STORAGE_KEY = 'mictlan_guest_cart_v1';
export const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_CART_QUANTITY = 99;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const guestCartSubscribers = new Set();
let memorySnapshot = '';
let useMemorySnapshot = false;

function notifyGuestCartSubscribers() {
  guestCartSubscribers.forEach((subscriber) => subscriber());
}

export function getGuestCartStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function validItem(item) {
  return Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    && Object.keys(item).sort().join(',') === 'quantity,slug'
    && typeof item.slug === 'string' && SLUG_PATTERN.test(item.slug)
    && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= MAX_CART_QUANTITY;
}

export function emptyGuestCart() {
  return { items: [], lastActivityAt: null };
}

export function parseGuestCart(serialized, now = Date.now()) {
  if (typeof serialized !== 'string' || serialized.length > 20_000) return emptyGuestCart();
  try {
    const value = JSON.parse(serialized);
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'items,lastActivityAt'
      || !Array.isArray(value.items) || value.items.length > 100
      || !Number.isSafeInteger(value.lastActivityAt) || value.lastActivityAt < 0
      || (now !== null && (now - value.lastActivityAt >= GUEST_CART_TTL_MS || value.lastActivityAt > now + 60_000))) {
      return emptyGuestCart();
    }
    const seen = new Set();
    if (value.items.some((item) => {
      if (!validItem(item) || seen.has(item.slug)) return true;
      seen.add(item.slug);
      return false;
    })) return emptyGuestCart();
    return { items: value.items.map(({ slug, quantity }) => ({ slug, quantity })), lastActivityAt: value.lastActivityAt };
  } catch {
    return emptyGuestCart();
  }
}

export function readGuestCart(storage, now = Date.now()) {
  try {
    return parseGuestCart(storage?.getItem(GUEST_CART_STORAGE_KEY), now);
  } catch {
    return emptyGuestCart();
  }
}

export function getGuestCartSnapshot() {
  if (useMemorySnapshot) return memorySnapshot;
  try {
    return getGuestCartStorage()?.getItem(GUEST_CART_STORAGE_KEY) ?? memorySnapshot;
  } catch {
    return memorySnapshot;
  }
}

export function getServerGuestCartSnapshot() {
  return null;
}

export function subscribeToGuestCart(subscriber) {
  guestCartSubscribers.add(subscriber);
  const storage = getGuestCartStorage();
  const raw = getGuestCartSnapshot();
  if (raw) {
    const parsed = parseGuestCart(raw, Date.now());
    const hasState = parsed.lastActivityAt !== null || parsed.items.length > 0;
    const normalized = hasState ? JSON.stringify(parsed) : '';
    memorySnapshot = normalized;
    useMemorySnapshot = !storage;
    try {
      if (storage && normalized !== raw) {
        if (normalized) storage.setItem(GUEST_CART_STORAGE_KEY, normalized);
        else storage.removeItem(GUEST_CART_STORAGE_KEY);
      }
    } catch {
      useMemorySnapshot = true;
    }
  }
  const onStorage = (event) => {
    if (event.key !== GUEST_CART_STORAGE_KEY && event.key !== null) return;
    const parsed = parseGuestCart(event.newValue, Date.now());
    const hasState = parsed.lastActivityAt !== null || parsed.items.length > 0;
    memorySnapshot = hasState ? JSON.stringify(parsed) : '';
    useMemorySnapshot = !getGuestCartStorage();
    notifyGuestCartSubscribers();
  };
  globalThis.addEventListener?.('storage', onStorage);
  return () => {
    guestCartSubscribers.delete(subscriber);
    globalThis.removeEventListener?.('storage', onStorage);
  };
}

export function writeGuestCart(storage, cart) {
  memorySnapshot = JSON.stringify(cart);
  if (!storage) {
    useMemorySnapshot = true;
    notifyGuestCartSubscribers();
    return false;
  }
  try {
    storage.setItem(GUEST_CART_STORAGE_KEY, memorySnapshot);
    useMemorySnapshot = false;
    notifyGuestCartSubscribers();
    return true;
  } catch {
    memorySnapshot = JSON.stringify(cart);
    useMemorySnapshot = true;
    notifyGuestCartSubscribers();
    return false;
  }
}

export function updateGuestCart(current, slug, quantity, now = Date.now()) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)
    || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_CART_QUANTITY) return current;
  const items = current.items.filter((item) => item.slug !== slug);
  if (quantity > 0) items.push({ slug, quantity });
  const lastActivityAt = Math.max(now, (current.lastActivityAt ?? 0) + 1);
  return { items, lastActivityAt };
}

export function addGuestCartItem(current, slug, now = Date.now()) {
  const quantity = Math.min(MAX_CART_QUANTITY, (current.items.find((item) => item.slug === slug)?.quantity ?? 0) + 1);
  return updateGuestCart(current, slug, quantity, now);
}

export async function createCartTransferId(cart) {
  const source = JSON.stringify({ items: cart.items, lastActivityAt: cart.lastActivityAt });
  const bytes = new TextEncoder().encode(source);
  let digest;
  if (globalThis.crypto?.subtle) digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  else {
    digest = new Uint8Array(16);
    const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    const primes = [0x01000193, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];
    for (const byte of bytes) {
      for (let lane = 0; lane < hashes.length; lane += 1) {
        hashes[lane] = Math.imul(hashes[lane] ^ (byte + lane), primes[lane]);
      }
    }
    for (let lane = 0; lane < hashes.length; lane += 1) {
      for (let byte = 0; byte < 4; byte += 1) digest[lane * 4 + byte] = (hashes[lane] >>> (byte * 8)) & 0xff;
    }
  }
  const bytes16 = Array.from(digest.slice(0, 16));
  bytes16[6] = (bytes16[6] & 0x0f) | 0x50;
  bytes16[8] = (bytes16[8] & 0x3f) | 0x80;
  const hex = bytes16.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
