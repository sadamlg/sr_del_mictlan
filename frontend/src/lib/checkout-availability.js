
import { MAX_CART_QUANTITY } from './guest-cart.js';
export function getAddToCartButtonState(checkoutState, {
  hydrated = true,
  pending = false,
  isRestoring = false,
  quantity = 0,
} = {}) {
  if (!hydrated) return { enabled: false, label: 'Cargando carrito…' };
  if (checkoutState === 'disabled') return { enabled: false, label: 'Próximamente' };
  if (checkoutState === 'unavailable') return { enabled: false, label: 'No disponible' };
  if (checkoutState !== 'enabled') return { enabled: false, label: 'Consultando…' };
  if (pending || isRestoring) return { enabled: false, label: 'Cargando carrito…' };
  if (quantity >= MAX_CART_QUANTITY) return { enabled: false, label: 'Límite alcanzado' };
  return { enabled: true, label: 'Agregar al carrito' };
}
