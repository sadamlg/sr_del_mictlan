'use client';

import { MAX_CART_QUANTITY } from '../../lib/guest-cart.js';

import Link from 'next/link';
import { Minus, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useDesktopViewport } from '../../hooks/use-desktop-viewport.js';
import { lockBodyScroll } from '../header/behavior.js';
import { useCart } from './cart-provider.js';
import ResponsiveMediaImage from '../media/responsive-media-image.js';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function CartLine({ item, disabled, onChange, onRemove }) {
  const [name, descriptor] = item.name.split(' · ', 2);
  const hasMultipleUnits = item.quantity > 1;

  return (
    <li className="py-4">
      <div className="flex items-stretch gap-[clamp(0.375rem,1.8vw,0.75rem)]">
        <div className="relative min-h-[clamp(5rem,20vw,6rem)] w-[clamp(3rem,12vw,5rem)] shrink-0 self-stretch overflow-hidden border border-mictlan-sand/15 bg-mictlan-carbon/70">
          {item.imageUrl ? (
            <ResponsiveMediaImage
              pictureClassName="absolute inset-0 block"
              src={item.imageUrl}
              alt={item.imageAlt || ''}
              widths={[160, 360]}
              sizes="(max-width: 640px) 20vw, 80px"
              width={140}
              height={160}
              className="absolute inset-0 size-full object-contain p-1"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-display text-3xl text-mictlan-sage/50" aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_1fr] items-start gap-x-[clamp(0.25rem,1vw,0.75rem)] gap-y-2">
          <div className="col-start-1 row-start-1 min-w-0">
            <h3 className="break-words font-display text-[clamp(0.8125rem,3vw,1.125rem)] leading-[1.15] text-mictlan-bone">{name}</h3>
            {descriptor && (
              <p className="mt-1 break-words font-ui text-[clamp(0.6875rem,2.25vw,0.75rem)] uppercase leading-tight tracking-[0.04em] text-mictlan-sage-muted sm:tracking-[0.08em]">
                {descriptor}
              </p>
            )}
            {!item.available && <p className="mt-1 text-sm leading-5 text-mictlan-error-text">Este producto ya no está disponible.</p>}
          </div>
          <div className="col-start-2 row-start-1 flex items-start justify-self-end gap-1 sm:gap-2">
            {item.available && (
              <p className="money-line whitespace-nowrap">
                {money.format(item.lineTotal.amount / 100)}
              </p>
            )}
            {hasMultipleUnits && (
              <button
                type="button"
                disabled={disabled}
                onClick={onRemove}
                aria-label={`Quitar ${item.name}`}
                className="inline-flex size-10 items-start justify-center pt-0.5 text-mictlan-sage/70 transition-colors hover:text-mictlan-error-text disabled:opacity-40 sm:size-11"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="col-span-2 row-start-2 self-end justify-self-end">
            <div className="inline-flex items-center border border-mictlan-sage/35 text-mictlan-bone">
              {hasMultipleUnits ? (
                <button
                  type="button"
                  disabled={disabled || !item.available}
                  onClick={() => onChange(item.quantity - 1)}
                  aria-label={`Disminuir cantidad de ${item.name}`}
                  className="inline-flex size-10 items-center justify-center transition-colors hover:text-mictlan-teal disabled:opacity-40 sm:size-11"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onRemove}
                  aria-label={`Quitar ${item.name}`}
                  className="inline-flex size-10 items-center justify-center transition-colors hover:text-mictlan-error-text disabled:opacity-40 sm:size-11"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
              <span className="min-w-8 text-center font-ui text-sm tabular-nums sm:min-w-10" aria-live="polite">
                {item.quantity}
              </span>
              <button
                type="button"
                disabled={disabled || !item.available || item.quantity >= MAX_CART_QUANTITY}
                onClick={() => onChange(item.quantity + 1)}
                aria-label={`Aumentar cantidad de ${item.name}`}
                className="inline-flex size-10 items-center justify-center transition-colors hover:text-mictlan-teal disabled:opacity-40 sm:size-11"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function CartDrawer() {
  const {
    activePanel, closeCart, isCartClosing: isClosing, setIsCartClosing: setIsClosing, items, totalCount, subtotal, error, pending,
    isRestoring, isAccount, isAccountLoading, setQuantity, removeItem, retry,
  } = useCart();
  const isOpen = activePanel === 'cart';
  const closingTimerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const shownRef = useRef(false);
  const modeRef = useRef(null);
  const restoreKeyboardFocusRef = useRef(true);
  const isDesktop = useDesktopViewport();
  const closeAndRestoreFocus = useCallback((event) => {
    restoreKeyboardFocusRef.current = event?.type === 'keydown' || event?.type === 'cancel' || event?.detail === 0 || event?.detail?.keyboard === true;
    if (closingTimerRef.current) return;
    setIsClosing(true);
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
    closingTimerRef.current = window.setTimeout(() => {
      closingTimerRef.current = null;
      closeCart();
      setIsClosing(false);
    }, duration);
  }, [closeCart, setIsClosing]);

  useEffect(() => () => window.clearTimeout(closingTimerRef.current), []);

  useEffect(() => {
    window.addEventListener('cart-request-close', closeAndRestoreFocus);
    return () => window.removeEventListener('cart-request-close', closeAndRestoreFocus);
  }, [closeAndRestoreFocus]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const mode = isDesktop ? 'modal' : 'modeless';
    if (isOpen) {
      if (dialog.open && modeRef.current !== mode) dialog.close();
      if (!dialog.open) {
        if (isDesktop) dialog.showModal();
        else dialog.show();
        shownRef.current = true;
      }
      modeRef.current = mode;
      window.requestAnimationFrame(() => {
        if (isDesktop) closeButtonRef.current?.focus();
      });
      return;
    }
    if (dialog.open) dialog.close();
    modeRef.current = null;
    if (shownRef.current) {
      shownRef.current = false;
      window.requestAnimationFrame(() => {
        const toggle = document.getElementById('cart-toggle');
        if (!document.getElementById('age-gate-title') && restoreKeyboardFocusRef.current) toggle?.focus();
        else if (document.activeElement === toggle) toggle.blur();
      });
    }
  }, [isDesktop, isOpen]);

  useEffect(() => {
    if (!isOpen || isDesktop) return undefined;
    return lockBodyScroll(document.body);
  }, [isDesktop, isOpen]);

  useEffect(() => {
    if (!isOpen || isDesktop) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndRestoreFocus(event);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [document.getElementById('cart-toggle'), ...dialogRef.current.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeAndRestoreFocus, isDesktop, isOpen]);

  const closeOnBackdrop = (event) => {
    if (event.target === event.currentTarget) closeAndRestoreFocus(event);
  };
  const unavailableCount = items.filter((item) => !item.available).length;
  const unitLabel = totalCount === 1 ? 'producto' : 'productos';

  return (
    <>
      {isOpen && !isDesktop && <div className="fixed inset-x-0 bottom-0 top-[120px] z-[55] bg-black/70 lg:hidden" aria-hidden="true" onClick={closeAndRestoreFocus} />}
      <dialog
        ref={dialogRef}
        id="cart-dialog"
        className={`cart-dialog fixed left-auto right-0 top-[120px] z-[60] m-0 h-[calc(100dvh-120px)] max-h-[calc(100dvh-120px)] w-[90vw] max-w-[32rem] overflow-hidden border-0 bg-mictlan-carbon p-0 text-mictlan-bone shadow-2xl backdrop:bg-black/70 lg:bottom-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-full lg:max-w-[32rem]${isClosing ? ' cart-dialog-closing' : ''}`}
        aria-labelledby="cart-title"
        aria-modal={isDesktop ? "true" : "false"}
        onCancel={(event) => { event.preventDefault(); closeAndRestoreFocus(event); }}
        onClick={closeOnBackdrop}
      >
        <section className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-mictlan-bone/20 px-5 py-5 sm:px-7">
            <div>
              <h2 id="cart-title" className="font-display text-xl uppercase tracking-[0.06em] text-mictlan-bone sm:text-2xl">Tu carrito</h2>
              <p className="mt-1 font-ui text-xs uppercase tracking-[0.13em] text-mictlan-sage sm:text-[13px]">{totalCount} {unitLabel}</p>
            </div>
            <button ref={closeButtonRef} id="cart-close" type="button" onClick={closeAndRestoreFocus} aria-label="Cerrar carrito" className="hidden size-10 items-center justify-center rounded-sm text-mictlan-sage lg:inline-flex transition-colors hover:text-mictlan-teal focus-visible:outline-2 focus-visible:outline-mictlan-teal"><X className="size-6" aria-hidden="true" /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {error && <div className="mx-5 mt-5 rounded-sm border border-mictlan-red/60 bg-mictlan-red/10 p-4 text-sm text-mictlan-error-text sm:mx-7" role="alert"><p>{error}</p><button type="button" onClick={retry} disabled={pending} className="mt-3 min-h-11 font-ui text-xs font-semibold uppercase tracking-[0.1em] text-mictlan-teal underline underline-offset-4 disabled:opacity-50">Reintentar carga del carrito</button></div>}
            {isRestoring || isAccountLoading || pending && !items.length ? (
              <div className="flex h-full min-h-56 items-center justify-center px-8 text-center text-sm text-mictlan-sage" role="status">Consultando tu cuenta…</div>
            ) : error && items.length === 0 ? null : items.length === 0 ? (
              <div className="flex h-full min-h-56 items-center justify-center px-8 text-center">
                <div><ShoppingBasket className="mx-auto size-10 text-mictlan-sage/60" aria-hidden="true" /><p className="mt-5 font-display text-lg uppercase tracking-[0.06em] text-mictlan-bone">El carrito está vacío</p></div>
              </div>
            ) : (
              <ul className="m-0 list-none px-5 py-0 sm:px-7">{items.map((item) => <CartLine key={item.slug} item={item} disabled={pending || isRestoring} onChange={(quantity) => setQuantity(item, quantity)} onRemove={() => removeItem(item)} />)}</ul>
            )}
          </div>

          <footer className="shrink-0 border-t border-mictlan-bone/20 bg-mictlan-carbon px-5 pb-6 pt-5 sm:px-7">
            {items.length > 0 ? (
              <>
                {unavailableCount > 0 && isAccount && <p className="mb-3 text-sm leading-5 text-mictlan-error-text">Quita los productos no disponibles para continuar.</p>}
                <div className="flex items-center justify-between gap-4"><span className="money-summary-label">Subtotal</span><strong className="money-summary-value">MXN {money.format(subtotal.amount / 100)}</strong></div>
                {isAccount ? (
                  <>
                    <Link href="/cuenta/checkout" onClick={closeAndRestoreFocus} className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full border border-mictlan-teal/70 bg-mictlan-teal-deep/80 px-5 text-center font-ui text-xs font-semibold uppercase tracking-[0.13em] text-mictlan-bone no-underline transition-colors hover:bg-mictlan-teal-hover focus-visible:outline-2 focus-visible:outline-mictlan-teal">Ir al resumen de compra</Link>
                    <Link href="/#coleccion" onClick={closeAndRestoreFocus} className="mt-2 flex min-h-10 w-full items-center justify-center px-5 text-center text-sm text-mictlan-teal underline underline-offset-4 hover:text-mictlan-bone">Seguir comprando</Link>
                  </>
                ) : (
                <Link href="/cuenta/iniciar-sesion?continuar=checkout" onClick={closeAndRestoreFocus} className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full border border-mictlan-teal/70 bg-mictlan-teal-deep/80 px-5 text-center font-ui text-xs font-semibold uppercase tracking-[0.13em] text-mictlan-bone no-underline transition-colors hover:bg-mictlan-teal-hover focus-visible:outline-2 focus-visible:outline-mictlan-teal">Inicia sesión para pagar</Link>
                )}
              </>
            ) : (
              <Link href="/#coleccion" onClick={closeAndRestoreFocus} className="flex min-h-12 w-full items-center justify-center rounded-full border border-mictlan-teal/70 bg-mictlan-teal-deep/80 px-5 text-center font-ui text-xs font-semibold uppercase tracking-[0.13em] text-mictlan-bone no-underline transition-colors hover:bg-mictlan-teal-hover focus-visible:outline-2 focus-visible:outline-mictlan-teal">Seguir comprando</Link>
            )}
          </footer>
        </section>
      </dialog>
    </>
  );
}
