import { ShoppingBasket, UserRound } from 'lucide-react';
import FacebookLink from '../social/facebook-link';

export default function HeaderActions() {
  return (
    <div className="order-3 flex flex-1 items-center justify-end gap-4 lg:flex-none">
      <FacebookLink className="hidden size-11 shrink-0 items-center justify-center rounded-sm text-mictlan-sand/90 transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal lg:inline-flex" />
      <button type="button" disabled aria-label="Iniciar sesión, disponible próximamente" title="Inicio de sesión disponible próximamente" className="hidden min-h-9 items-center gap-2 text-mictlan-sand/90 lg:flex">
        <UserRound className="h-7 w-7 shrink-0" aria-hidden="true" />
      </button>
      <button id="cart-toggle" type="button" disabled aria-label="Carrito, disponible próximamente" title="Carrito disponible próximamente" className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-mictlan-sand/90">
        <ShoppingBasket className="size-7" aria-hidden="true" />
      </button>
    </div>
  );
}
