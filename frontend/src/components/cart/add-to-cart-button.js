'use client';

import { ShoppingBasket } from 'lucide-react';
import { useEffect } from 'react';
import { useCart } from './cart-provider.js';

export default function AddToCartButton({ product }) {
  const { addProduct, registerProduct, items, pending, isRestoring } = useCart();
  useEffect(() => registerProduct(product), [product, registerProduct]);
  const quantity = items.find((item) => item.slug === product.slug)?.quantity ?? 0;
  const disabled = pending || isRestoring || quantity >= 99;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Agregar al carrito: ${product.name}`}
      onClick={() => void addProduct(product)}
      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-mictlan-teal/70 bg-mictlan-teal-deep/90 px-6 font-ui text-xs font-semibold uppercase tracking-[0.14em] text-mictlan-bone transition-colors hover:bg-mictlan-teal-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal disabled:cursor-not-allowed disabled:opacity-50 lg:mt-2"
    >
      <ShoppingBasket className="size-4" aria-hidden="true" /> Agregar al carrito
    </button>
  );
}
