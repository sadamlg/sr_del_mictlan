import { Suspense } from 'react';
import AccountRoute from '../../../components/account/account-route.js';

export default function AccountCheckoutPage() {
  return <Suspense fallback={<p className="w-full text-center text-sm text-mictlan-sage-muted" role="status">Preparando tu resumen de compra…</p>}><AccountRoute page="checkout" /></Suspense>;
}
