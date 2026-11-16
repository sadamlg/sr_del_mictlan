'use client';

import { useAccountSession } from './account-session.js';
import { AccountButton, AccountCard, AccountNotice, AccountTextLink } from './account-ui.js';

export default function AccountAccess({ children, continueToCheckout = false }) {
  const session = useAccountSession();
  if (session.status === 'loading' || session.status === 'refreshing') {
    return <AccountCard title="Consultando tu sesión"><AccountNotice role="status">Estamos comprobando que tu sesión siga activa.</AccountNotice></AccountCard>;
  }
  if (session.status === 'error') {
    return <AccountCard title="No pudimos cargar tu cuenta"><div className="space-y-4 text-center"><AccountNotice variant="error" role="alert">{session.error}</AccountNotice><AccountButton type="button" onClick={session.refresh}>Intentar de nuevo</AccountButton></div></AccountCard>;
  }
  if (session.status === 'guest') {
    return <AccountCard title="Inicia sesión para continuar" description="Tu información personal está protegida y solo tú puedes consultarla.">
      <div className="flex flex-col items-center gap-4"><AccountTextLink href={continueToCheckout ? '/cuenta/iniciar-sesion?continuar=checkout' : '/cuenta/iniciar-sesion'}>Iniciar sesión</AccountTextLink><AccountTextLink href={continueToCheckout ? '/cuenta/registro?continuar=checkout' : '/cuenta/registro'}>Crear una cuenta</AccountTextLink></div>
    </AccountCard>;
  }
  return children(session.account);
}
