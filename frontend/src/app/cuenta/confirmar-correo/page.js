import { Suspense } from 'react';
import AccountRoute from '../../../components/account/account-route.js';

export default function EmailConfirmationPage() {
  return <Suspense fallback={<p className="w-full text-center text-sm text-mictlan-sage-muted" role="status">Cargando enlace…</p>}><AccountRoute page="confirmar-correo" /></Suspense>;
}
