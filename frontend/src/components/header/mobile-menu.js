import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { navigationItems } from './navigation';
import { getMenuToggleProps, getMobileNavigationProps } from './behavior';
import AccountMenu from '../account/account-menu.js';
import FacebookLink from '../social/facebook-link';

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

export default function MobileMenu({ isOpen, onClose, onNavigationSelect, activeNavigationItemId }) {
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
              {navigationItems.map(({ href, id, label }) => {
                const isCurrent = activeNavigationItemId === id;
                return (
                  <li className="h-[47.5px]" key={id}>
                    <Link
                      className={`flex h-full w-full items-center border-l-2 border-transparent pl-[28px] pr-[30px] text-inherit no-underline transition-[color,border-color] duration-150 ease-out hover:text-mictlan-teal focus-visible:text-mictlan-teal${isCurrent ? ' border-l-mictlan-teal text-mictlan-teal' : ''}`}
                      href={href}
                      data-navigation-item={id}
                      onClick={(event) => {
                        onNavigationSelect(id, event);
                        onClose();
                      }}
                      aria-current={isCurrent ? 'location' : undefined}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-[75px]">
            <div className="flex flex-col">
              <AccountMenu mobile onNavigate={onClose} />
            </div>
            <div className="mt-[10px] border-t border-mictlan-bone/30" />
            <FacebookLink className="mb-[60px] mt-4 flex h-[48.45px] items-center gap-2 pl-[30px] font-display uppercase tracking-[0.025em] text-mictlan-sage no-underline transition-colors duration-150 ease-out hover:text-mictlan-teal focus-visible:text-mictlan-teal">Facebook</FacebookLink>
          </div>
        </div>
      </div>
    </aside>
  );
}
