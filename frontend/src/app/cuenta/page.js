import { Suspense } from 'react';
import AccountRoute from '../../components/account/account-route.js';

export default function AccountPage() {
  return <Suspense fallback={<p className="w-full text-center text-sm text-mictlan-sage-muted" role="status">Cargando tu perfil…</p>}><AccountRoute page="cuenta" /></Suspense>;
}
