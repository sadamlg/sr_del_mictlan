'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAccountSession } from '../account/account-session.js';
import { accountRequest } from '../../lib/account-api.js';
import { mediaObjectUrl } from '../../lib/media-url.js';
import {
  addGuestCartItem,
  createCartTransferId,
  emptyGuestCart,
  getGuestCartSnapshot,
  getGuestCartStorage,
  getServerGuestCartSnapshot,
  MAX_CART_QUANTITY,
  parseGuestCart,
  subscribeToGuestCart,
  updateGuestCart,
  writeGuestCart,
} from '../../lib/guest-cart.js';
import {
  getCartCatalogSnapshot,
  getServerCartCatalogSnapshot,
  registerCartProduct,
  subscribeToCartCatalog,
} from './cart-catalog-store.js';

const CartContext = createContext(null);

function apiMessage(error) {
  return error instanceof Error ? error.message : 'No pudimos actualizar tu carrito. Inténtalo de nuevo.';
}

function countItems(items) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function normalizeCurrentCart(value) {
  if (!value || !Array.isArray(value.items) || !value.subtotal) throw new Error('El servidor devolvió un carrito inválido.');
  return value;
}

function resolveImage(item, product, mediaBaseUrl) {
  if (item.imageUrl || product?.image?.url) return item.imageUrl || product.image.url;
  if (!item.imageKey) return undefined;
  try {
    return mediaObjectUrl(mediaBaseUrl, item.imageKey);
  } catch {
    return undefined;
  }
}

export function CartProvider({ children, mediaBaseUrl = '' }) {
  const session = useAccountSession();
  const guestSnapshot = useSyncExternalStore(subscribeToGuestCart, getGuestCartSnapshot, getServerGuestCartSnapshot);
  const guestCart = useMemo(() => parseGuestCart(guestSnapshot ?? '', null), [guestSnapshot]);
  const localReady = guestSnapshot !== null;
  const catalog = useSyncExternalStore(subscribeToCartCatalog, getCartCatalogSnapshot, getServerCartCatalogSnapshot);
  const guestCartRef = useRef(guestCart);
  const [accountCart, setAccountCart] = useState(null);
  const [accountCartAccountId, setAccountCartAccountId] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [isCartClosing, setIsCartClosing] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [error, setError] = useState('');
  const [mergeFailed, setMergeFailed] = useState(false);
  const [unavailableSlugs, setUnavailableSlugs] = useState([]);
  const [pending, setPending] = useState(false);
  const [checkoutState, setCheckoutState] = useState('loading');
  const syncing = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const accountReady = session.status === 'account'
    && Boolean(accountCart && accountCartAccountId === session.account?.id);

  useEffect(() => {
    guestCartRef.current = guestCart;
  }, [guestCart]);

  useEffect(() => {
    const closePanelsBehindAgeGate = () => setActivePanel(null);
    window.addEventListener('mictlan:age-gate-visible', closePanelsBehindAgeGate);
    return () => window.removeEventListener('mictlan:age-gate-visible', closePanelsBehindAgeGate);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    accountRequest('public-config', { signal: controller.signal }).then((config) => {
      if (active) setCheckoutState(config?.checkoutEnabled === true ? 'enabled' : 'disabled');
    }).catch(() => {
      if (active) setCheckoutState('unavailable');
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const commitGuestCart = useCallback((next) => {
    guestCartRef.current = next;
    writeGuestCart(getGuestCartStorage(), next);
  }, []);

  const registerProduct = useCallback((product) => registerCartProduct(product), []);
  const openCart = useCallback(() => {
    if (document.getElementById('age-gate-title')) return;
    setActivePanel('cart');
  }, []);
  const closeCart = useCallback(() => setActivePanel((current) => current === 'cart' ? null : current), []);
  const toggleCart = useCallback(() => {
    if (document.getElementById('age-gate-title')) return;
    setActivePanel((current) => current === 'cart' ? null : 'cart');
  }, []);
  const toggleMenu = useCallback(() => {
    if (document.getElementById('age-gate-title')) return;
    setActivePanel((current) => current === 'menu' ? null : 'menu');
  }, []);
  const closeMenu = useCallback(() => setActivePanel((current) => current === 'menu' ? null : current), []);

  const fetchAccountCart = useCallback(async () => {
    const payload = await accountRequest('cart/account');
    return normalizeCurrentCart(payload?.cart);
  }, []);

  const syncAccount = useCallback(async () => {
    const accountId = session.account?.id;
    if (!localReady || session.status !== 'account' || !accountId || syncing.current) return;
    syncing.current = true;
    setPending(true);
    setError('');
    const localSnapshot = guestCartRef.current;
    try {
      const before = await fetchAccountCart();
      const snapshot = localSnapshot.items;
      if (snapshot.length === 0) {
        setAccountCart(before);
        setAccountCartAccountId(accountId);
        setMergeFailed(false);
        return;
      }

      const transferId = await createCartTransferId(localSnapshot);
      const payload = await accountRequest('cart/account/merge', {
        method: 'POST',
        body: { transferId, items: snapshot },
      });
      let nextCart = normalizeCurrentCart(payload?.cart);
      const latestLocal = guestCartRef.current;
      if (latestLocal.lastActivityAt !== localSnapshot.lastActivityAt) {
        const beforeBySlug = new Map(before.items.map((item) => [item.slug, item]));
        const afterBySlug = new Map(nextCart.items.map((item) => [item.slug, item]));
        const latestBySlug = new Map(latestLocal.items.map((item) => [item.slug, item]));
        const changedSlugs = new Set([...snapshot.map((item) => item.slug), ...latestLocal.items.map((item) => item.slug)]);
        for (const slug of changedSlugs) {
          const desired = Math.min(MAX_CART_QUANTITY, (beforeBySlug.get(slug)?.quantity ?? 0) + (latestBySlug.get(slug)?.quantity ?? 0));
          const actual = afterBySlug.get(slug)?.quantity ?? 0;
          if (desired === actual) continue;
          if (desired === 0) {
            await accountRequest(`cart/account/items/${encodeURIComponent(slug)}`, { method: 'DELETE' });
          } else {
            await accountRequest('cart/account/items', { method: 'PUT', body: { slug, quantity: desired } });
          }
        }
        nextCart = await fetchAccountCart();
      }
      setAccountCart(nextCart);
      setAccountCartAccountId(accountId);
      setMergeFailed(false);
      setUnavailableSlugs([]);
      setError('');
      commitGuestCart(emptyGuestCart());
    } catch (syncError) {
      setAccountCart(null);
      setAccountCartAccountId(null);
      setMergeFailed(guestCartRef.current.items.length > 0);
      setUnavailableSlugs(Array.isArray(syncError?.fields?.unavailableSlugs) ? syncError.fields.unavailableSlugs : []);
      setError(apiMessage(syncError));
    } finally {
      syncing.current = false;
      setPending(false);
    }
  }, [commitGuestCart, fetchAccountCart, localReady, session.account?.id, session.status]);

  useEffect(() => {
    if (!localReady || session.status !== 'account') return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) void syncAccount();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [localReady, retryKey, session.status, session.account?.id, syncAccount]);

  const addProduct = useCallback(async (product) => {
    if (checkoutState !== 'enabled' || !product?.slug || !product.price?.amount || pending || document.getElementById('age-gate-title')) return;
    registerProduct(product);
    setError('');
    if (accountReady && !mergeFailed) {
      setPending(true);
      try {
        const current = accountCart.items.find((item) => item.slug === product.slug)?.quantity ?? 0;
        const payload = await accountRequest('cart/account/items', {
          method: 'PUT',
          body: { slug: product.slug, quantity: Math.min(MAX_CART_QUANTITY, current + 1) },
        });
        setAccountCart(normalizeCurrentCart(payload?.cart));
      } catch (writeError) {
        setError(apiMessage(writeError));
      } finally {
        setPending(false);
      }
    } else {
      commitGuestCart(addGuestCartItem(guestCartRef.current, product.slug));
    }
    openCart();
  }, [accountCart, accountReady, checkoutState, commitGuestCart, mergeFailed, openCart, pending, registerProduct]);

  const setQuantity = useCallback(async (item, quantity) => {
    if (pending || !item.available) return;
    setError('');
    if (accountReady && !mergeFailed) {
      setPending(true);
      try {
        const payload = await accountRequest('cart/account/items', {
          method: 'PUT', body: { slug: item.slug, quantity },
        });
        setAccountCart(normalizeCurrentCart(payload?.cart));
      } catch (writeError) {
        setError(apiMessage(writeError));
      } finally {
        setPending(false);
      }
    } else {
      commitGuestCart(updateGuestCart(guestCartRef.current, item.slug, quantity));
    }
  }, [accountReady, commitGuestCart, mergeFailed, pending]);

  const removeItem = useCallback(async (item) => {
    if (pending) return;
    setError('');
    if (session.status === 'account' && mergeFailed) {
      commitGuestCart(updateGuestCart(guestCartRef.current, item.slug, 0));
      setMergeFailed(false);
      setRetryKey((key) => key + 1);
      return;
    }
    if (accountReady) {
      setPending(true);
      try {
        await accountRequest(`cart/account/items/${encodeURIComponent(item.slug)}`, { method: 'DELETE' });
        setAccountCart(await fetchAccountCart());
      } catch (writeError) {
        setError(apiMessage(writeError));
      } finally {
        setPending(false);
      }
    } else {
      commitGuestCart(updateGuestCart(guestCartRef.current, item.slug, 0));
    }
  }, [accountReady, commitGuestCart, fetchAccountCart, mergeFailed, pending, session.status]);

  const retry = useCallback(() => {
    if (session.status === 'error' || session.status === 'loading') {
      void session.refresh();
      return;
    }
    setRetryKey((key) => key + 1);
  }, [session]);

  const reorderPaidOrder = useCallback(async (orderId, transferId) => {
    if (!accountReady || mergeFailed || pending) throw new Error('Espera a que termine de cargar tu carrito.');
    if (typeof transferId !== 'string') throw new Error('No pudimos preparar el reintento de forma segura.');
    setPending(true);
    setError('');
    try {
      const result = await accountRequest(`orders/${encodeURIComponent(orderId)}/reorder`, {
        method: 'POST',
        body: { transferId },
      });
      setAccountCart(await fetchAccountCart());
      return { unavailableSlugs: Array.isArray(result?.unavailableSlugs) ? result.unavailableSlugs : [] };
    } catch (reorderError) {
      setError(apiMessage(reorderError));
      throw reorderError;
    } finally {
      setPending(false);
    }
  }, [accountReady, fetchAccountCart, mergeFailed, pending]);

  const isRestoring = !localReady || ['loading', 'refreshing'].includes(session.status)
    || (session.status === 'account' && !accountReady && !mergeFailed);
  const sourceItems = session.status === 'account' && accountReady && !mergeFailed
    ? accountCart.items
    : guestCart.items.map((item) => {
      const product = catalog[item.slug];
      const available = Boolean(product?.price?.amount > 0 && !(mergeFailed && unavailableSlugs.includes(item.slug)));
      return {
        slug: item.slug,
        name: product?.name ?? item.slug.replaceAll('-', ' '),
        quantity: item.quantity,
        available,
        imageUrl: product?.image?.url,
        imageAlt: product?.image?.alt ?? '',
        unitPrice: available ? product.price : null,
        lineTotal: available ? { amount: product.price.amount * item.quantity, currency: 'MXN' } : null,
      };
    });
  const items = sourceItems.map((item) => {
    const product = catalog[item.slug];
    return {
      ...item,
      imageUrl: resolveImage(item, product, mediaBaseUrl),
      imageAlt: item.imageAlt || product?.image?.alt || '',
    };
  });
  const totalCount = countItems(items);
  const subtotal = accountReady && !mergeFailed
    ? accountCart.subtotal
    : { amount: items.reduce((total, item) => total + (item.lineTotal?.amount ?? 0), 0), currency: 'MXN' };
  const displayError = session.status === 'error'
    ? session.error || 'No pudimos consultar tu sesión. Inténtalo de nuevo.'
    : session.status === 'account' ? error : '';
  const value = {
    activePanel, isCartClosing, setIsCartClosing, openCart, closeCart, toggleCart, toggleMenu, closeMenu,
    addProduct, registerProduct, setQuantity, removeItem, retry,
    checkoutState,
    checkoutNotice, setCheckoutNotice, reorderPaidOrder,
    items, totalCount, subtotal, error: displayError, pending, isRestoring,
    isAccount: session.status === 'account',
    isAccountLoading: session.status === 'account' && !accountReady && !mergeFailed,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe usarse dentro de CartProvider.');
  return context;
}
