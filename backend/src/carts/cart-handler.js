import { AccountError } from '../accounts/account-service.js';
import { readSessionCookie } from '../accounts/session-cookie.js';
import { CartError } from './cart-service.js';

function responseError(response, error) {
  if (error instanceof AccountError || error instanceof CartError || error?.status === 409) {
    return response.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
  }
  return response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No pudimos actualizar tu carrito.' } });
}

function wrap(handler) {
  return async (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.set('X-Frame-Options', 'DENY');
    try {
      const result = await handler(request);
      if (result?.status === 204) return response.status(204).end();
      return response.status(200).json(result);
    } catch (error) {
      return responseError(response, error);
    }
  };
}

export function createCartHandlers({ accountService, cartService }) {
  const currentAccount = async (request) => {
    return accountService.getSession(readSessionCookie(request));
  };
  return {
    getAccountCart: wrap(async (request) => ({ cart: await cartService.getAccountCart((await currentAccount(request)).id) })),
    setAccountItem: wrap(async (request) => {
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).sort().join(',') !== 'quantity,slug') {
        throw new CartError(422, 'INVALID_CART_ITEM', 'El producto o la cantidad no son válidos.');
      }
      return { cart: await cartService.setAccountItem((await currentAccount(request)).id, body) };
    }),
    removeAccountItem: wrap(async (request) => {
      await cartService.removeAccountItem((await currentAccount(request)).id, request.params.slug);
      return { status: 204 };
    }),
    mergeGuestCart: wrap(async (request) => {
      const body = request.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).sort().join(',') !== 'items,transferId') {
        throw new CartError(422, 'INVALID_CART_TRANSFER', 'La transferencia del carrito no es válida.');
      }
      return { cart: await cartService.mergeGuestCart((await currentAccount(request)).id, body) };
    }),
  };
}
