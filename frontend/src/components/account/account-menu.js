'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ClipboardList, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { accountRequest } from '../../lib/account-api.js';
import { useAccountSession } from './account-session.js';
import useAccountViewReset from './use-account-view-reset.js';

export default function AccountMenu({ mobile = false, onNavigate }) {
  const { status, account, refresh } = useAccountSession();
  const pathname = usePathname();
  const router = useRouter();
  const [error, setError] = useState('');
  const menuRef = useRef(null);
  const clearErrorBeforeLeaving = useCallback(() => setError(''), []);
  useAccountViewReset(clearErrorBeforeLeaving);
  useEffect(() => {
    function handlePointerDown(event) {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    }
    function handleKeyDown(event) {
      const menu = menuRef.current;
      if (event.key === 'Escape' && menu?.open) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  const mobileActionClass = 'group flex min-h-12 w-full items-center gap-3 border border-mictlan-bone/15 bg-mictlan-background/45 px-3 font-ui text-sm font-medium tracking-wide text-mictlan-sand no-underline transition-colors duration-150 hover:border-mictlan-teal/50 hover:bg-mictlan-teal/10 hover:text-mictlan-ivory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mictlan-teal active:bg-mictlan-teal/15';
  const mobileIconClass = 'size-5 shrink-0 text-mictlan-sage/80 transition-colors group-hover:text-mictlan-teal';
  const desktopActionClass = 'flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-2 text-sm text-mictlan-sand outline-offset-4 hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-mictlan-teal [&::-webkit-details-marker]:hidden';
  const handleSignOut = async () => {
    setError('');
    try {
      await accountRequest('auth/logout', { method: 'POST' });
      router.replace('/');
      onNavigate?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (status === 'loading' || status === 'refreshing') return mobile
    ? <div className="space-y-3">
      <p className="px-7 pt-2 font-ui text-xs uppercase tracking-[0.18em] text-mictlan-teal">Tu cuenta</p>
      <nav aria-label="Acciones de cuenta" className="px-7">
        <span className={`${mobileActionClass} cursor-wait opacity-55`} role="status"><UserRound aria-hidden="true" className={mobileIconClass} />Cargando cuenta</span>
      </nav>
    </div>
    : <span className="inline-flex size-11 items-center justify-center text-mictlan-sand/50" aria-label="Cargando cuenta" role="status"><UserRound aria-hidden="true" className="size-7" /></span>;
  if (status === 'error') {
    return mobile
      ? <div className="space-y-3">
        <p className="px-7 pt-2 font-ui text-xs uppercase tracking-[0.18em] text-mictlan-teal">Tu cuenta</p>
        <nav aria-label="Acciones de cuenta" className="px-7">
          <button className={mobileActionClass} type="button" onClick={refresh}><RefreshCw aria-hidden="true" className={mobileIconClass} /><span>Reintentar cuenta</span></button>
        </nav>
      </div>
      : <button className="inline-flex size-11 items-center justify-center rounded-sm text-mictlan-sand/90 transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal" type="button" onClick={refresh} aria-label="Reintentar carga de cuenta" title="Cuenta"><UserRound aria-hidden="true" className="size-7" /></button>;
  }
  if (status !== 'account' || !account) {
    const loginLink = <Link
      href="/cuenta/iniciar-sesion"
      className={mobile ? mobileActionClass : 'inline-flex size-11 items-center justify-center rounded-sm text-mictlan-sand/90 no-underline transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal'}
      aria-label="Iniciar sesión"
      title="Iniciar sesión"
      onClick={onNavigate}
    >{mobile && <UserRound aria-hidden="true" className={mobileIconClass} />}{mobile ? <><span>Iniciar sesión</span><ChevronRight aria-hidden="true" className="ml-auto size-4 text-mictlan-earth-muted transition-colors group-hover:text-mictlan-teal" /></> : <UserRound aria-hidden="true" className="size-7" />}</Link>;
    return mobile ? <div className="px-7">{loginLink}</div> : loginLink;
  }

  const menuItems = [
    { href: '/cuenta/pedidos', label: 'Mis pedidos', icon: ClipboardList },
    { href: '/cuenta', label: 'Mi cuenta', icon: UserRound },
  ];
  return (
    <div className={mobile ? 'space-y-3' : 'relative'}>
      <p className={mobile ? 'px-7 pt-2 font-ui text-xs uppercase tracking-[0.18em] text-mictlan-teal' : 'sr-only'}>Hola, {account.firstName}</p>
      {mobile ? (
        <>
          <nav aria-label="Acciones de cuenta" className="grid gap-2 px-7">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isCurrent = pathname === item.href || (item.href === '/cuenta' && pathname === '/cuenta/seguridad');
              return <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`${mobileActionClass} ${isCurrent ? 'border-mictlan-teal/60 bg-mictlan-teal/10 text-mictlan-ivory' : ''}`}
                onClick={onNavigate}
              >
                <Icon aria-hidden="true" className={`${mobileIconClass} ${isCurrent ? 'text-mictlan-teal' : ''}`} />
                <span>{item.label}</span>
                <ChevronRight aria-hidden="true" className="ml-auto size-4 text-mictlan-earth-muted transition-colors group-hover:text-mictlan-teal" />
              </Link>;
            })}
            <button className={`${mobileActionClass} text-mictlan-sage`} type="button" onClick={handleSignOut}><LogOut aria-hidden="true" className={mobileIconClass} /><span>Cerrar sesión</span></button>
          </nav>
          {error && <p className="px-7 text-sm text-mictlan-red-hover" role="alert">{error}</p>}
        </>
      ) : (
        <details ref={menuRef} className="group relative">
          <summary className={desktopActionClass}>
            <UserRound aria-hidden="true" className="size-7" />
            <span>Hola, {account.firstName}</span>
          </summary>
          <nav aria-label="Menú de cuenta" className="absolute right-0 top-full z-[70] mt-2 min-w-52 border border-mictlan-bone/15 bg-mictlan-carbon p-2 shadow-xl">
            {menuItems.map((item) => <Link key={item.href} href={item.href} className="flex min-h-11 items-center px-3 text-sm text-mictlan-sand hover:bg-mictlan-teal/10 hover:text-mictlan-teal" onClick={(event) => { event.currentTarget.closest('details').open = false; }}>{item.label}</Link>)}
            <button type="button" onClick={handleSignOut} className="flex min-h-11 w-full items-center gap-2 border-t border-mictlan-bone/10 px-3 text-left text-sm text-mictlan-sand hover:text-mictlan-teal"><LogOut aria-hidden="true" className="size-4" />Cerrar sesión</button>
            {error && <p className="px-3 py-2 text-xs text-mictlan-red-hover" role="alert">{error}</p>}
          </nav>
        </details>
      )}
    </div>
  );
}
