import { Suspense } from 'react';
import AccountRoute from '../../../components/account/account-route.js';

export default function AccountSecurityPage() {
  return <Suspense fallback={<p className="w-full text-center text-sm text-mictlan-sage-muted" role="status">Cargando seguridad…</p>}><AccountRoute page="seguridad" /></Suspense>;
}
