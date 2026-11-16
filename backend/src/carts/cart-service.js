const MAX_QUANTITY = 99;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRANSFER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CartError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CartError';
    this.status = status;
    this.code = code;
  }
}

function validateIdentity(accountId) {
  if (typeof accountId !== 'string' || !accountId.trim()) {
    throw new CartError(422, 'INVALID_CART_ACCOUNT', 'La cuenta no es válida.');
  }
}

function validateItem({ slug, quantity }) {
  if (typeof slug !== 'string' || slug.length > 80 || !SLUG_PATTERN.test(slug)
    || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new CartError(422, 'INVALID_CART_ITEM', 'El producto o la cantidad no son válidos.');
  }
}

function unavailable() {
  return new CartError(409, 'PRODUCT_NOT_AVAILABLE', 'Este producto ya no está disponible.');
}

function serializeItem(row) {
  const product = row.product;
  const available = Boolean(product?.active && Number.isInteger(product.priceCents) && product.priceCents > 0);
  const unitPrice = available ? { amount: product.priceCents, currency: 'MXN' } : null;
  return {
    slug: product?.slug ?? row.slug,
    name: product?.name ?? row.name ?? 'Producto no disponible',
    quantity: row.quantity,
    available,
    ...(product?.imageKey ? { imageKey: product.imageKey, imageAlt: product.imageAlt ?? '' } : {}),
    unitPrice,
    lineTotal: available ? { amount: product.priceCents * row.quantity, currency: 'MXN' } : null,
  };
}

function buildCart(rows) {
  const items = rows.map(serializeItem);
  const amount = items.reduce((total, item) => total + (item.lineTotal?.amount ?? 0), 0);
  return { items, subtotal: { amount, currency: 'MXN' } };
}

export function createCartService(repository) {
  return {
    async getAccountCart(accountId) {
      validateIdentity(accountId);
      return buildCart(await repository.findAccountCartItems(accountId));
    },

    async setAccountItem(accountId, input) {
      validateIdentity(accountId);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new CartError(422, 'INVALID_CART_ITEM', 'El producto o la cantidad no son válidos.');
      }
      validateItem(input);
      const product = await repository.findPurchasableProductBySlug(input.slug);
      if (!product?.active || !Number.isInteger(product.priceCents) || product.priceCents <= 0) throw unavailable();
      await repository.setAccountCartItem({ accountId, productId: product.id, quantity: input.quantity });
      return this.getAccountCart(accountId);
    },

    async removeAccountItem(accountId, slug) {
      validateIdentity(accountId);
      if (typeof slug !== 'string' || slug.length > 80 || !SLUG_PATTERN.test(slug)) {
        throw new CartError(422, 'INVALID_CART_ITEM', 'El producto no es válido.');
      }
      await repository.removeAccountCartItem(accountId, slug);
    },

    async mergeGuestCart(accountId, input) {
      validateIdentity(accountId);
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).sort().join(',') !== 'items,transferId'
        || !TRANSFER_ID_PATTERN.test(input.transferId ?? '')
        || !Array.isArray(input.items) || input.items.length > 100) {
        throw new CartError(422, 'INVALID_CART_TRANSFER', 'La transferencia del carrito no es válida.');
      }
      const seen = new Set();
      for (const item of input.items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)
          || Object.keys(item).sort().join(',') !== 'quantity,slug') {
          throw new CartError(422, 'INVALID_CART_TRANSFER', 'La transferencia del carrito no es válida.');
        }
        validateItem(item);
        if (seen.has(item.slug)) throw new CartError(422, 'INVALID_CART_TRANSFER', 'La transferencia contiene productos repetidos.');
        seen.add(item.slug);
      }
      await repository.mergeGuestCart(accountId, input.transferId, input.items);
      return this.getAccountCart(accountId);
    },
  };
}
