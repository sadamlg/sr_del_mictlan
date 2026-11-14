import { ShoppingBasket } from 'lucide-react';
import FacebookLink from '../social/facebook-link';
import AccountMenu from '../account/account-menu.js';

export default function HeaderActions() {
  return (
    <div className="order-3 flex flex-1 items-center justify-end gap-1 lg:flex-none">
      <FacebookLink className="hidden size-11 shrink-0 items-center justify-center rounded-sm text-mictlan-sand/90 transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal lg:inline-flex" />
      <div className="hidden lg:block"><AccountMenu /></div>
      <button id="cart-toggle" type="button" disabled aria-label="Carrito, disponible próximamente" title="Carrito disponible próximamente" className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-mictlan-sand/90">
        <ShoppingBasket className="size-7" aria-hidden="true" />
      </button>
    </div>
  );
}
