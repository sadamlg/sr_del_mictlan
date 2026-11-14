'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { accountRequest } from '../../lib/account-api.js';
import TurnstileWidget from './turnstile-widget.js';
import useAccountViewReset from './use-account-view-reset.js';
import {
  AccountButton, AccountCard, AccountField, AccountFormError, AccountTextLink, getFieldErrors, getFormError,
} from './account-ui.js';

export default function SignInView({ continueToCheckout = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [challenge, setChallenge] = useState(0);
  const router = useRouter();
  const onToken = useCallback((value) => setToken(value), []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    if (!email.trim() || !password) { setError('Escribe tu correo y contraseña.'); return; }
    if (!token) { setError('Completa la verificación de seguridad para continuar.'); return; }
    setBusy(true);
    try {
      await accountRequest('auth/login', { method: 'POST', body: { email, password, turnstileToken: token } });
      router.replace(continueToCheckout ? '/cuenta?continuar=checkout' : '/');
    } catch (requestError) {
      setPassword('');
      setPasswordVisible(false);
      setError(getFormError(requestError, 'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.'));
      setFieldErrors(getFieldErrors(requestError));
    } finally {
      setBusy(false);
      setToken('');
      setChallenge((value) => value + 1);
    }
  };

  const clearCredentialsBeforeLeaving = useCallback(() => {
    setEmail('');
    setPassword('');
    setPasswordVisible(false);
    setError('');
    setFieldErrors({});
    setToken('');
    setChallenge((value) => value + 1);
  }, []);
  useAccountViewReset(clearCredentialsBeforeLeaving);

  return (
    <AccountCard className="sign-in-view" title="Inicia sesión" description="Vuelve a tu espacio personal y consulta tus datos y pedidos.">
      <form className="sign-in-form space-y-5" noValidate onSubmit={submit}>
        <AccountFormError error={error} />
        <AccountField
          id="email"
          label="Correo electrónico"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          value={email}
          error={fieldErrors.email}
          onChange={(event) => { setEmail(event.target.value); setError(''); setFieldErrors((current) => ({ ...current, email: undefined })); }}
          inputIcon={<Mail className="size-4 text-mictlan-teal" />}
        />
        <AccountField
          id="password"
          label="Contraseña"
          type={passwordVisible ? 'text' : 'password'}
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          error={fieldErrors.password}
          onChange={(event) => { setPassword(event.target.value); setError(''); setFieldErrors((current) => ({ ...current, password: undefined })); }}
          labelAction={<AccountTextLink href="/cuenta/recuperar-contrasena">¿Olvidaste tu contraseña?</AccountTextLink>}
          inputAction={(
            <button
              className="flex size-10 items-center justify-center rounded-sm text-mictlan-teal transition-colors hover:text-mictlan-teal-bright"
              type="button"
              aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={passwordVisible}
              aria-controls="password"
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          )}
        />
        <TurnstileWidget action="account_login" onToken={onToken} resetKey={challenge} />
        <AccountButton busy={busy} disabled={!token}>Entrar a mi cuenta</AccountButton>
      </form>
      <div className="sign-in-register mt-7 border-t border-mictlan-sand/10 pt-5 text-center text-sm text-mictlan-sage-muted">
        ¿Aún no tienes cuenta? <AccountTextLink href={continueToCheckout ? '/cuenta/registro?continuar=checkout' : '/cuenta/registro'}>Crear una cuenta</AccountTextLink>
      </div>
    </AccountCard>
  );
}
