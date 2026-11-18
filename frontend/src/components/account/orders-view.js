'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { accountRequest } from '../../lib/account-api.js';
import {
  CHECKOUT_RETURN_MAX_ATTEMPTS, checkoutReturnMessage, checkoutReturnPollDelay, createCheckoutTransferId,
} from '../../lib/checkout.js';
import { reorderStateAfterNavigation } from '../../lib/account-navigation-state.js';
import { useAccountSession } from './account-session.js';
import { useCart } from '../cart/cart-provider.js';
import AccountAccess from './account-access.js';
import OrderSummary from './order-summary.js';
import SignOutButton from './sign-out-button.js';
import useAccountViewReset from './use-account-view-reset.js';
import { AccountButton, AccountCard, AccountLink, AccountNavigation, AccountNotice } from './account-ui.js';

export default function OrdersList() {
  const { status: sessionStatus } = useAccountSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { reorderPaidOrder, setCheckoutNotice, retry: refreshCart } = useCart();
  const [state, setState] = useState({ attempt: -1, status: 'loading', orders: [], error: '' });
  const [attempt, setAttempt] = useState(0);
  const [orderImages, setOrderImages] = useState({});
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [returnState, setReturnState] = useState({ sessionId: '', status: 'idle', message: '' });
  const [reorderState, setReorderState] = useState({ id: '', busy: false, error: '' });
  const handledPaidSession = useRef('');
  const reorderTransfers = useRef(new Map());
  const returnSessionId = searchParams.get('checkout') === 'return' ? searchParams.get('session_id') || '' : '';
  const resetBeforeLeaving = useCallback((navigationType) => {
    setState({ attempt: -1, status: 'loading', orders: [], error: '' });
    setReorderState((current) => reorderStateAfterNavigation(current, navigationType));
    if (navigationType === 'history' || navigationType === 'restore') setAttempt((value) => value + 1);
  }, []);
  useAccountViewReset(resetBeforeLeaving);
  useEffect(() => {
    if (sessionStatus !== 'account') return undefined;
    let active = true;
    accountRequest('orders').then(({ orders }) => {
      if (active) setState({ attempt, status: 'ready', orders: Array.isArray(orders) ? orders : [], error: '' });
    }).catch((error) => {
      if (active) setState({ attempt, status: 'error', orders: [], error: error.message });
    });
    return () => { active = false; };
  }, [attempt, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== 'account' || !state.orders.length) return undefined;
    const controller = new AbortController();
    accountRequest('catalog/products', { signal: controller.signal }).then(({ products }) => {
      if (!controller.signal.aborted && Array.isArray(products)) setOrderImages(Object.fromEntries(products.map((product) => [product.slug, product.image])));
    }).catch(() => {});
    return () => controller.abort();
  }, [sessionStatus, state.orders]);

  useEffect(() => {
    if (sessionStatus !== 'account' || !returnSessionId) return undefined;
    let active = true;
    let timeoutId;
    let attempts = 0;
    const scheduleRetry = () => {
      if (!active) return;
      attempts += 1;
      if (attempts >= CHECKOUT_RETURN_MAX_ATTEMPTS) return;
      timeoutId = window.setTimeout(checkStatus, checkoutReturnPollDelay(attempts));
    };
    const checkStatus = async () => {
      try {
        const result = await accountRequest(`checkout/return-status?session_id=${encodeURIComponent(returnSessionId)}`);
        if (!active) return;
        const status = ['PAID', 'FAILED', 'EXPIRED', 'NOT_FOUND', 'PENDING'].includes(result?.status) ? result.status : 'PENDING';
        const notice = checkoutReturnMessage(status);
        setReturnState({ sessionId: returnSessionId, status, message: notice.message, kind: notice.kind });
        if (status === 'PAID' && handledPaidSession.current !== returnSessionId) {
          handledPaidSession.current = returnSessionId;
          setAttempt((value) => value + 1);
          refreshCart();
        } else if (status === 'PENDING') {
          scheduleRetry();
        }
      } catch (error) {
        if (active) setReturnState({ sessionId: returnSessionId, status: 'error', message: error.message, kind: 'error' });
        scheduleRetry();
      }
    };
    void checkStatus();
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [returnSessionId, sessionStatus, statusAttempt, refreshCart]);

  const stateStatus = state.attempt === attempt ? state.status : 'loading';
  const visibleReturnState = returnState.sessionId === returnSessionId
    ? returnState
    : { sessionId: returnSessionId, status: 'checking', message: 'Esperamos la confirmación del pago de Stripe…', kind: 'info' };
  return <AccountAccess>{() => <AccountCard className="account-orders-view" eyebrow="Tu espacio personal" title="Mis pedidos" description="Consulta aquí el estado y los detalles de tus compras." wide>
    <AccountNavigation active="orders" />
    {returnSessionId && <div className="mb-5"><AccountNotice variant={visibleReturnState.kind === 'error' ? 'error' : visibleReturnState.kind || 'info'} role={visibleReturnState.kind === 'error' ? 'alert' : 'status'}>{visibleReturnState.message}</AccountNotice></div>}
    {returnSessionId && ['PENDING', 'error', 'NOT_FOUND'].includes(visibleReturnState.status) && <button type="button" onClick={() => { setStatusAttempt((value) => value + 1); setAttempt((value) => value + 1); refreshCart(); }} className="mb-5 inline-flex min-h-10 items-center border border-mictlan-teal/50 px-4 text-sm text-mictlan-teal hover:bg-mictlan-teal/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal">Actualizar pedidos</button>}
    {reorderState.error && <div className="mb-5"><AccountNotice variant="error" role="alert">{reorderState.error}</AccountNotice></div>}
    {stateStatus === 'loading'
      ? <AccountNotice role="status">Cargando tus pedidos…</AccountNotice>
      : stateStatus === 'error'
        ? <div className="space-y-4"><AccountNotice variant="error" role="alert">{state.error}</AccountNotice><AccountButton type="button" onClick={() => setAttempt((value) => value + 1)}>Intentar de nuevo</AccountButton></div>
        : state.orders.length === 0
          ? <div className="py-8 text-center">
            <h2 className="font-display text-xl text-mictlan-ivory">Aún no tienes pedidos</h2>
            <p className="mt-2 text-sm leading-6 text-mictlan-sage-muted">Cuando realices un pedido, aparecerá aquí.</p>
            <AccountLink href="/#coleccion" className="mt-5">Explorar la colección</AccountLink>
          </div>
          : <div className="space-y-4">{state.orders.map((order) => <OrderSummary key={order.id} order={order} images={orderImages} busy={reorderState.busy} active={reorderState.busy && reorderState.id === order.id} onReorder={async () => {
              setReorderState({ id: order.id, busy: true, error: '' });
              try {
                const transferId = reorderTransfers.current.get(order.id) || createCheckoutTransferId();
                reorderTransfers.current.set(order.id, transferId);
                const result = await reorderPaidOrder(order.id, transferId);
                reorderTransfers.current.delete(order.id);
                const missing = order.items.filter((item) => result.unavailableSlugs.includes(item.slug)).map((item) => item.name);
                setCheckoutNotice(missing.length
                  ? `Se agregó lo disponible. No se pudieron agregar: ${missing.join(', ')}.`
                  : 'Los productos de este pedido se agregaron a tu carrito.');
                setReorderState({ id: '', busy: false, error: '' });
                router.push('/cuenta/checkout');
              } catch (error) {
                setReorderState({ id: order.id, busy: false, error: error.message || 'No pudimos volver a agregar este pedido.' });
              }
            }} />)}</div>}
    {stateStatus !== 'error' && <div className="mt-8 border-t border-mictlan-sand/10 pt-5"><SignOutButton /></div>}
  </AccountCard>}</AccountAccess>;
}
