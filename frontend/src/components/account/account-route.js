'use client';

import { useSearchParams } from 'next/navigation';
import AccountAccess from './account-access.js';
import { AccountCard, AccountLink } from './account-ui.js';
import CheckoutView from './checkout-view.js';
import OrdersList from './orders-view.js';
import LoginForm from './sign-in-view.js';
import {
  ChangePasswordForm, EmailConfirmation, PasswordRecoveryForm,
  PasswordResetForm, ProfileForm, RegistrationForm,
} from './account-forms.js';

export default function AccountRoute({ page }) {
  const searchParams = useSearchParams();
  const continueToCheckout = searchParams.get('continuar') === 'checkout';
  const token = searchParams.get('token') || '';

  if (page === 'registro') return <RegistrationForm continueToCheckout={continueToCheckout} />;
  if (page === 'iniciar-sesion') return <LoginForm continueToCheckout={continueToCheckout} />;
  if (page === 'recuperar-contrasena') return <PasswordRecoveryForm />;
  if (page === 'restablecer-contrasena') return <PasswordResetForm token={token} />;
  if (page === 'confirmar-correo') return <EmailConfirmation token={token} continueToCheckout={continueToCheckout} />;
  if (page === 'checkout') return <AccountAccess continueToCheckout>{(account) => <CheckoutView account={account} />}</AccountAccess>;
  if (page === 'pedidos') return <OrdersList />;
  if (page === 'seguridad') return <AccountAccess>{() => <ChangePasswordForm />}</AccountAccess>;
  if (page === 'cuenta') return continueToCheckout
    ? <AccountAccess continueToCheckout>{(account) => <CheckoutView account={account} />}</AccountAccess>
    : <AccountAccess>{() => <ProfileForm />}</AccountAccess>;
  return <AccountCard title="Cuenta"><p>No encontramos esta sección.</p><AccountLink href="/cuenta">Volver a mi cuenta</AccountLink></AccountCard>;
}
