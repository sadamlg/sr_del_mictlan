import { ShoppingBasket, X } from 'lucide-react';
import FacebookLink from '../social/facebook-link';
import AccountMenu from '../account/account-menu.js';
import { useCart } from '../cart/cart-provider.js';
import { useDesktopViewport } from '../../hooks/use-desktop-viewport.js';

export default function HeaderActions() {
  const { activePanel, isCartClosing, toggleCart, totalCount } = useCart();
  const isDesktop = useDesktopViewport();
  const cartOpen = activePanel === 'cart';
  const closeIcon = cartOpen && !isCartClosing && !isDesktop;
  const itemLabel = totalCount === 1 ? 'producto' : 'productos';
  return (
    <div className="order-3 flex flex-1 items-center justify-end gap-1 lg:flex-none">
      <FacebookLink className="hidden size-11 shrink-0 items-center justify-center rounded-sm text-mictlan-sand/90 transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal lg:inline-flex" />
      <div className="hidden lg:block"><AccountMenu /></div>
      <button id="cart-toggle" type="button" aria-controls="cart-dialog" aria-expanded={cartOpen} onClick={(event) => { if (cartOpen && !isDesktop) window.dispatchEvent(new CustomEvent('cart-request-close', { detail: { keyboard: event.detail === 0 } })); else toggleCart(); }} aria-label={`${cartOpen ? 'Cerrar carrito' : 'Abrir carrito'}, ${totalCount} ${itemLabel}`} title={`Carrito: ${totalCount} ${itemLabel}`} className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-mictlan-sand/90 transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal">
        <span className={`relative size-7 transition-transform duration-[800ms] ease-in-out motion-reduce:transition-none${closeIcon ? ' rotate-180' : ''}`} aria-hidden="true">
          <ShoppingBasket className={`absolute inset-0 size-7 transition-opacity duration-500 motion-reduce:transition-none${closeIcon ? ' opacity-0' : ' opacity-100'}`} />
          <X className={`absolute inset-0 size-7 transition-opacity duration-1000 motion-reduce:transition-none${closeIcon ? ' opacity-100' : ' opacity-0'}`} />
        </span>
        {totalCount > 0 && !closeIcon && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex min-h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full bg-mictlan-teal-deep px-1 font-ui text-xs font-bold leading-none tabular-nums text-mictlan-bone">{totalCount > 99 ? '99+' : totalCount}</span>}
      </button>
    </div>
  );
}
