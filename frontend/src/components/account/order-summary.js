'use client';

import Image from 'next/image';
import { CalendarDays, ChevronDown, Repeat2, Wine } from 'lucide-react';

function formatMoney(value) {
  if (!value || !Number.isSafeInteger(value.amount) || typeof value.currency !== 'string') return '—';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: value.currency }).format(value.amount / 100); }
  catch { return '—'; }
}

function formatDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' }).format(date) : 'Fecha no disponible';
}

export default function OrderSummary({ order, images, busy, active, onReorder }) {
  const reference = typeof order.id === 'string' ? order.id.slice(0, 8).toUpperCase() : '—';
  const itemCount = order.items.reduce((count, item) => count + item.quantity, 0);
  const itemLabel = itemCount === 1 ? 'producto' : 'productos';

  return <details className="group overflow-hidden border border-mictlan-sand/15 bg-mictlan-carbon/25">
    <summary className="flex min-h-24 cursor-pointer list-none items-center justify-between gap-3 bg-mictlan-carbon/30 px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mictlan-teal sm:gap-5 sm:px-5 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="break-words font-display text-lg text-mictlan-ivory">Pedido {reference}</h2>
          <span className="border border-mictlan-teal/30 bg-mictlan-teal-deep/20 px-3 py-1 text-xs font-semibold text-mictlan-teal">Pagado</span>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-mictlan-sage-muted">
          <span className="inline-flex items-center gap-2"><CalendarDays className="size-4 shrink-0" aria-hidden="true" />{formatDate(order.paidAt || order.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{itemCount} {itemLabel}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <div className="text-right">
          <span className="money-summary-label block">Total</span>
          <strong className="money-summary-value whitespace-nowrap">{formatMoney(order.total)}</strong>
        </div>
        <ChevronDown className="size-5 shrink-0 text-mictlan-sage-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </div>
    </summary>
    <div className="border-t border-mictlan-sand/10">
      <ul className="m-0 list-none divide-y divide-mictlan-sand/10 px-4 sm:px-5">
        {order.items.map((item, index) => <li key={`${item.slug}-${index}`} className="flex items-center gap-3 py-4 sm:gap-4">
          <span className="relative flex h-20 w-15 shrink-0 items-center justify-center overflow-hidden border border-mictlan-sand/10 bg-mictlan-carbon/50 text-mictlan-sage-muted">{images[item.slug]?.url ? <Image src={images[item.slug].url} alt="" width={60} height={80} unoptimized className="absolute inset-0 size-full object-contain p-1" /> : <Wine className="size-5" aria-hidden="true" />}</span>
          <div className="min-w-0 flex-1"><p className="break-words font-display text-base leading-snug text-mictlan-ivory">{item.name}</p><p className="money-detail mt-1 text-mictlan-sage-muted">{item.quantity} × {formatMoney(item.unitPrice)}</p></div>
          <span className="money-line shrink-0 text-right">{formatMoney(item.lineTotal)}</span>
        </li>)}
      </ul>
      <footer className="border-t border-mictlan-sand/10 px-4 py-4 sm:px-5">
        <button type="button" disabled={busy} aria-busy={active || undefined} aria-label={`Volver a pedir los productos del pedido ${reference}`} onClick={onReorder} className="inline-flex min-h-11 items-center justify-center gap-2 border border-mictlan-teal/50 px-4 py-2 font-ui text-xs font-semibold text-mictlan-teal transition-colors hover:border-mictlan-teal hover:bg-mictlan-teal/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal disabled:cursor-wait disabled:opacity-50"><Repeat2 className="size-4" aria-hidden="true" />{active ? 'Agregando…' : 'Volver a pedir'}</button>
      </footer>
    </div>
  </details>;
}
