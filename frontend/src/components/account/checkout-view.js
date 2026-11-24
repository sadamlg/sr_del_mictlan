'use client';

import { MAX_CART_QUANTITY } from '../../lib/guest-cart.js';

import Link from 'next/link';
import { CreditCard, Minus, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { accountRequest } from '../../lib/account-api.js';
import {
  normalizeCheckoutRecipient,
  recipientFromAccount,
  validateCheckoutRecipient,
  validateHostedCheckoutUrl,
} from '../../lib/checkout.js';
import { AccountButton, AccountCard, AccountField, AccountFormError, AccountLink, AccountNotice } from './account-ui.js';
import { useCart } from '../cart/cart-provider.js';
import ResponsiveMediaImage from '../media/responsive-media-image.js';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const ADDRESS_FIELDS = [
  ['street', 'Calle', 'address-line1'],
  ['number', 'Número exterior', 'address-line2'],
  ['neighborhood', 'Colonia', 'address-level3'],
  ['locality', 'Ciudad o municipio', 'address-level2'],
  ['state', 'Estado', 'address-level1'],
  ['postalCode', 'Código postal', 'postal-code'],
];

function amountLabel(amount) {
  return money.format(amount / 100);
}

function SavedCards({ status, cards, error }) {
  if (status === 'loading') return <AccountNotice role="status">Consultando tarjetas guardadas en Stripe…</AccountNotice>;
  if (status === 'error') return <AccountNotice variant="error">{error} Puedes continuar; Stripe volverá a mostrar las opciones disponibles al pagar.</AccountNotice>;
  if (cards.length === 0) return <p className="text-sm leading-6 text-mictlan-sage-muted">Stripe mostrará las formas de pago disponibles. Podrás aceptar que una tarjeta se guarde para compras futuras.</p>;
  return <div className="space-y-3">
    <p className="text-sm leading-6 text-mictlan-sage-muted">Tarjetas que Stripe permite mostrar. La selección y los datos de pago se gestionan en su página segura.</p>
    <ul className="space-y-2">
      {cards.map((card, index) => <li key={`${card.brand}-${card.last4}-${card.expMonth}-${card.expYear}-${index}`} className="flex items-center gap-3 border border-mictlan-sand/15 bg-mictlan-carbon/40 px-4 py-3">
        <CreditCard className="size-5 shrink-0 text-mictlan-teal" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <p className="font-ui font-medium capitalize text-mictlan-bone">{card.brand} ···· {card.last4}</p>
          <p className="mt-1 text-xs text-mictlan-sage-muted">Vence {String(card.expMonth).padStart(2, '0')}/{card.expYear}{card.cardholderName ? ` · ${card.cardholderName}` : ''}</p>
        </div>
      </li>)}
    </ul>
  </div>;
}

function CheckoutItem({ item, disabled, onQuantity, onRemove }) {
  const price = item.unitPrice?.amount;
  return <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-4 border-b border-mictlan-sand/10 py-4 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
    <div className="relative aspect-[3/4] overflow-hidden border border-mictlan-sand/15 bg-mictlan-carbon">
      {item.imageUrl ? <ResponsiveMediaImage pictureClassName="absolute inset-0 block" src={item.imageUrl} alt={item.imageAlt || ''} widths={[160, 360]} sizes="(max-width: 640px) 4.5rem, 5.5rem" width={160} height={200} loading="lazy" decoding="async" className="absolute inset-0 size-full object-contain p-1" />
        : <span className="absolute inset-0 flex items-center justify-center font-display text-2xl text-mictlan-sage/50" aria-hidden="true">{item.name.slice(0, 1)}</span>}
    </div>
    <div className="min-w-0">
      <h3 className="break-words font-display text-lg leading-tight text-mictlan-ivory">{item.name}</h3>
      {item.available
        ? <p className="money-detail mt-1 text-mictlan-sage-muted">{amountLabel(price)} por pieza</p>
        : <p className="mt-1 text-sm text-mictlan-error-text">Precio o disponibilidad por confirmar. Quita este producto para continuar.</p>}
    </div>
    <div className="col-start-2 flex flex-col items-end gap-3 sm:col-start-3 sm:row-start-1">
      <div className="flex items-center gap-3">
        <p className="money-line">{item.available ? amountLabel(item.lineTotal.amount) : '—'}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center border border-mictlan-sage/30" aria-label={`Cantidad de ${item.name}`}>
          {item.quantity > 1
            ? <button type="button" aria-label={`Disminuir cantidad de ${item.name}`} disabled={disabled || !item.available} onClick={() => onQuantity(item.quantity - 1)} className="inline-flex size-10 items-center justify-center text-mictlan-sage hover:text-mictlan-teal focus-visible:relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mictlan-teal disabled:opacity-40"><Minus className="size-4" aria-hidden="true" /></button>
            : <button type="button" aria-label={`Quitar ${item.name}`} disabled={disabled} onClick={onRemove} className="inline-flex size-10 items-center justify-center text-mictlan-sage hover:text-mictlan-error-text focus-visible:relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mictlan-teal disabled:opacity-40"><Trash2 className="size-4" aria-hidden="true" /></button>}
          <span className="money-detail min-w-8 text-center" aria-live="polite">{item.quantity}</span>
          <button type="button" aria-label={`Aumentar cantidad de ${item.name}`} disabled={disabled || !item.available || item.quantity >= MAX_CART_QUANTITY} onClick={() => onQuantity(item.quantity + 1)} className="inline-flex size-10 items-center justify-center text-mictlan-sage hover:text-mictlan-teal focus-visible:relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mictlan-teal disabled:opacity-40"><Plus className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
      {item.quantity > 1 && <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Quitar ${item.name}`} className="inline-flex min-h-9 items-center gap-1.5 text-xs text-mictlan-sage-muted transition-colors hover:text-mictlan-error-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mictlan-teal disabled:opacity-40"><Trash2 className="size-3.5" aria-hidden="true" />Quitar</button>}
    </div>
  </li>;
}

export default function CheckoutView({ account }) {
  const searchParams = useSearchParams();
  const { items, subtotal, pending, isRestoring, isAccountLoading, setQuantity, removeItem, error: cartError, retry, checkoutNotice, setCheckoutNotice } = useCart();
  const [recipient, setRecipient] = useState(() => recipientFromAccount(account));
  const [draft, setDraft] = useState(() => recipientFromAccount(account));
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [recipientErrors, setRecipientErrors] = useState({});
  const [cardsState, setCardsState] = useState({ status: 'loading', cards: [], error: '' });
  const [submitState, setSubmitState] = useState({ busy: false, error: '' });
  const itemUnavailable = items.some((item) => !item.available);
  const recipientValid = useMemo(() => Object.keys(validateCheckoutRecipient(recipient)).length === 0, [recipient]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    accountRequest('checkout/payment-methods', { signal: controller.signal }).then(({ cards }) => {
      if (active) setCardsState({ status: 'ready', cards: Array.isArray(cards) ? cards : [], error: '' });
    }).catch((error) => {
      if (active) setCardsState({ status: 'error', cards: [], error: error.message });
    });
    return () => { active = false; controller.abort(); };
  }, []);

  const saveRecipient = (event) => {
    event.preventDefault();
    const normalized = normalizeCheckoutRecipient(draft);
    const errors = validateCheckoutRecipient(normalized);
    setRecipientErrors(errors);
    if (Object.keys(errors).length) return;
    setRecipient(normalized);
    setDraft(normalized);
    setEditingRecipient(false);
  };

  const cancelRecipientEdit = () => {
    setDraft(recipient);
    setRecipientErrors({});
    setEditingRecipient(false);
  };

  const beginCheckout = async () => {
    setSubmitState({ busy: true, error: '' });
    try {
      const result = await accountRequest('checkout/sessions', { method: 'POST', body: { recipient } });
      const checkoutUrl = validateHostedCheckoutUrl(result?.checkoutUrl);
      if (!checkoutUrl) throw new Error('La sesión de pago devolvió un destino no válido. Inténtalo de nuevo.');
      window.location.assign(checkoutUrl);
    } catch (error) {
      setSubmitState({ busy: false, error: error.message || 'No pudimos abrir la página de pago. Inténtalo de nuevo.' });
    }
  };

  const cancelled = searchParams.get('checkout') === 'cancelled';

  return <AccountCard eyebrow="Compra segura" title="Resumen de compra" description="Revisa los productos y los datos de entrega antes de continuar a Stripe." wide>
    {cancelled && <div className="mb-5"><AccountNotice variant="info">El pago se canceló. Tu carrito sigue guardado; puedes revisar la compra o volver más tarde.</AccountNotice></div>}
    {checkoutNotice && <div className="mb-5"><AccountNotice variant="info"><div className="flex flex-wrap items-start justify-between gap-3"><span>{checkoutNotice}</span><button type="button" onClick={() => setCheckoutNotice('')} className="min-h-8 text-xs text-mictlan-teal underline underline-offset-4">Cerrar aviso</button></div></AccountNotice></div>}
    {cartError && <div className="mb-5 space-y-3"><AccountNotice variant="error" role="alert">{cartError}</AccountNotice><AccountButton type="button" variant="secondary" onClick={retry}>Reintentar carga del carrito</AccountButton></div>}

    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)]">
      <div className="space-y-8">
        <section aria-labelledby="checkout-items-title">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <div><p className="font-ui text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-mictlan-teal">01 · Productos</p><h2 id="checkout-items-title" className="mt-1 font-display text-xl text-mictlan-ivory">Tu selección</h2></div>
            <Link href="/#coleccion" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 border border-mictlan-teal/50 px-3 py-2 font-ui text-xs font-semibold text-mictlan-teal transition-colors hover:border-mictlan-teal hover:bg-mictlan-teal/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal"><Plus className="size-4" aria-hidden="true" />Agregar productos</Link>
          </div>
          {isRestoring || isAccountLoading || pending && !items.length
            ? <AccountNotice role="status">Consultando tu carrito…</AccountNotice>
            : items.length === 0
              ? <div className="border border-mictlan-sand/15 px-4 py-6 text-center"><p className="font-display text-lg text-mictlan-ivory">Tu carrito está vacío</p><p className="mt-2 text-sm text-mictlan-sage-muted">Agrega un producto para preparar tu compra.</p><AccountLink href="/#coleccion" className="mt-3">Explorar la colección</AccountLink></div>
              : <ul className="m-0 list-none divide-y divide-mictlan-sand/10 p-0">{items.map((item) => <CheckoutItem key={item.slug} item={item} disabled={pending || isRestoring} onQuantity={(quantity) => setQuantity(item, quantity)} onRemove={() => removeItem(item)} />)}</ul>}
        </section>

        <section aria-labelledby="checkout-recipient-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><p className="font-ui text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-mictlan-teal">02 · Entrega</p><h2 id="checkout-recipient-title" className="mt-1 font-display text-xl text-mictlan-ivory">Datos de quien recibe</h2></div>
            {!editingRecipient && <button type="button" aria-expanded={false} aria-controls="checkout-recipient-form" onClick={() => { setDraft(recipient); setRecipientErrors({}); setEditingRecipient(true); }} className="inline-flex min-h-10 items-center justify-center gap-2 border border-mictlan-teal/50 px-3 py-2 text-left font-ui text-xs font-semibold text-mictlan-teal transition-colors hover:border-mictlan-teal hover:bg-mictlan-teal/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal"><Pencil className="size-4 shrink-0" aria-hidden="true" />Editar para este pedido</button>}
          </div>
          <p className="mb-4 text-sm leading-6 text-mictlan-sage-muted">Estos datos se guardan en este pedido y no cambian tu perfil.</p>
          {editingRecipient ? <form id="checkout-recipient-form" noValidate onSubmit={saveRecipient} className="space-y-4">
            <AccountFormError error={Object.keys(recipientErrors).length ? 'Revisa los campos marcados.' : ''} />
            <div className="grid gap-4 sm:grid-cols-2">
              <AccountField id="recipient-name" label="Nombre completo" autoComplete="name" maxLength={255} required value={draft.name} error={recipientErrors.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              <AccountField id="recipient-email" label="Correo electrónico" type="email" autoComplete="email" maxLength={254} required value={draft.email} error={recipientErrors.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{ADDRESS_FIELDS.map(([field, label, autoComplete]) => <AccountField key={field} id={`recipient-${field}`} label={label} autoComplete={autoComplete} maxLength={field === 'postalCode' ? 5 : 120} inputMode={field === 'postalCode' ? 'numeric' : undefined} pattern={field === 'postalCode' ? '[0-9]{5}' : undefined} required value={draft.address[field]} error={recipientErrors[`address.${field}`]} onChange={(event) => setDraft((current) => ({ ...current, address: { ...current.address, [field]: event.target.value } }))} />)}</div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row"><AccountButton type="button" variant="secondary" onClick={cancelRecipientEdit}>Cancelar</AccountButton><AccountButton>Guardar para este pedido</AccountButton></div>
          </form> : <div className="border border-mictlan-sand/15 bg-mictlan-carbon/30 p-4 text-sm leading-6 text-mictlan-sage">
            <p className="font-medium text-mictlan-bone">{recipient.name}</p><p>{recipient.email}</p>
            <p className="mt-1">{recipient.address.street} {recipient.address.number}, {recipient.address.neighborhood}</p>
            <p>{recipient.address.locality}, {recipient.address.state} · C.P. {recipient.address.postalCode}</p>
            {!recipientValid && <p className="mt-3 text-mictlan-error-text">Completa los datos de entrega antes de continuar.</p>}
          </div>}
        </section>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-36 lg:self-start">
        <section aria-labelledby="checkout-cards-title" className="space-y-3">
          <div><p className="font-ui text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-mictlan-teal">03 · Pago</p><h2 id="checkout-cards-title" className="mt-1 font-display text-xl text-mictlan-ivory">Métodos disponibles</h2></div>
          <SavedCards status={cardsState.status} cards={cardsState.cards} error={cardsState.error} />
        </section>
        <section aria-labelledby="checkout-total-title" className="border border-mictlan-sand/20 bg-mictlan-carbon/50 p-5">
          <h2 id="checkout-total-title" className="font-display text-xl text-mictlan-ivory">Resumen del pago</h2>
          <div className="mt-5 flex items-center justify-between gap-3 border-b border-mictlan-sand/15 pb-4"><span className="money-summary-label">Subtotal</span><strong className="money-summary-value">{amountLabel(subtotal.amount)}</strong></div>
          <p className="mt-3 text-xs leading-5 text-mictlan-sage-muted">El costo de envío, si corresponde, se mostrará antes de pagar. Stripe procesa el pago en su página segura.</p>
          {submitState.error && <div className="mt-4"><AccountNotice variant="error" role="alert">{submitState.error}</AccountNotice></div>}
          <button type="button" disabled={submitState.busy || pending || isRestoring || isAccountLoading || !items.length || itemUnavailable || !recipientValid || editingRecipient} onClick={beginCheckout} aria-busy={submitState.busy || undefined} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 border border-mictlan-stripe-purple/80 bg-mictlan-stripe-purple px-5 py-3 font-ui text-xs font-semibold uppercase tracking-[0.12em] text-mictlan-bone transition-colors hover:bg-mictlan-stripe-purple-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal disabled:cursor-not-allowed disabled:opacity-50">
            {submitState.busy ? 'Preparando pago…' : <><ShieldCheck className="size-4" aria-hidden="true" />Continuar a Stripe</>}
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-mictlan-sage-muted">No guardamos números de tarjeta ni códigos de seguridad.</p>
        </section>
      </aside>
    </div>
  </AccountCard>;
}
