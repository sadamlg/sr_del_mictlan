import { Suspense } from 'react';
import AccountRoute from '../../../components/account/account-route.js';

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="w-full text-center text-sm text-mictlan-sage-muted" role="status">Cargando inicio de sesión…</p>}>
      <AccountRoute page="iniciar-sesion" />
    </Suspense>
  );
}
