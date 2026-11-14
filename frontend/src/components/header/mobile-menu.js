import { Menu, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import FacebookLink from '../social/facebook-link';
import { getMenuToggleProps, getMobileNavigationProps } from './behavior';

export function MobileMenuToggle({ isOpen, onToggle }) {
  return (
    <button
      id="mobile-menu-toggle"
      className="flex h-8 w-8 cursor-pointer border-0 bg-transparent p-0 text-inherit"
      type="button"
      aria-controls="mobile-navigation"
      {...getMenuToggleProps(isOpen)}
      onClick={onToggle}
    >
      <span className={`relative h-8 w-8 transition-transform duration-[800ms] ease-in-out motion-reduce:transition-none${isOpen ? ' rotate-180' : ''}`} aria-hidden="true">
        <Menu className={`absolute inset-0 h-9 w-9 text-mictlan-earth-muted/80 transition-opacity duration-500 motion-reduce:transition-none${isOpen ? ' opacity-0' : ' opacity-100'}`} />
        <X className={`absolute inset-0 h-9 w-9 text-mictlan-sand/80 transition-opacity duration-1000 motion-reduce:transition-none${isOpen ? ' opacity-100' : ' opacity-0'}`} />
      </span>
    </button>
  );
}

export default function MobileMenu({ isOpen, onClose }) {
  return (
    <aside
      id="mobile-navigation"
      className={`fixed left-0 top-[120px] z-[60] h-[calc(100dvh-120px)] w-full overscroll-contain overflow-hidden bg-mictlan-carbon font-display text-mictlan-bone transition-transform duration-300 ease-in-out motion-reduce:transition-none lg:hidden${isOpen ? ' translate-x-0' : ' -translate-x-full'}`}
      {...getMobileNavigationProps(isOpen)}
    >
      <div className="flex h-full flex-col gap-0.5 overflow-y-auto p-0">
        <div className="flex h-auto flex-col gap-0 text-xl font-medium">
          <nav className="pl-0 pt-4 font-display uppercase tracking-[0.025em] text-mictlan-sage" aria-label="Navegación móvil">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              <li className="h-[47.5px]"><Link className="flex h-full w-full items-center px-[30px] text-inherit no-underline transition-colors duration-150 ease-out hover:text-mictlan-teal focus-visible:text-mictlan-teal" href="/#coleccion" onClick={onClose}>Mezcales</Link></li>
              <li className="h-[47.5px]"><Link className="flex h-full w-full items-center px-[30px] text-inherit no-underline transition-colors duration-150 ease-out hover:text-mictlan-teal focus-visible:text-mictlan-teal" href="/#origen" onClick={onClose}>Nosotros</Link></li>
              <li className="h-[47.5px]"><Link className="flex h-full w-full items-center px-[30px] text-inherit no-underline transition-colors duration-150 ease-out hover:text-mictlan-teal focus-visible:text-mictlan-teal" href="/#coleccion" onClick={onClose}>Promociones</Link></li>
            </ul>
          </nav>
          <div className="mt-[75px]">
            <div className="flex flex-col">
              <div className="flex items-center gap-3 pl-[30px]">
                <button disabled type="button" aria-label="Iniciar sesión, disponible próximamente" className="group flex h-[48.45px] items-center gap-2 font-display uppercase tracking-[0.025em] text-mictlan-sage">
                  <UserRound className="h-6 w-6 text-mictlan-sage/80" aria-hidden="true" /> Iniciar sesión
                </button>
                <FacebookLink className="inline-flex size-11 items-center justify-center rounded-sm text-mictlan-sage transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal" />
              </div>
            </div>
            <div className="mb-[60px] mt-[10px] border-t border-mictlan-bone/30" />
          </div>
        </div>
      </div>
    </aside>
  );
}
