'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { accountRequest } from '../../lib/account-api.js';
import { fromIsoMexicanDate, hasFormChanges, isOpaqueTokenShape, toIsoMexicanDate, validateRegistrationForm } from '../../lib/account-form.js';
import { useAccountSession } from './account-session.js';
import SignOutButton from './sign-out-button.js';
import AccountDatePicker from './account-date-picker.js';
import TurnstileWidget from './turnstile-widget.js';
import useAccountViewReset from './use-account-view-reset.js';
import {
  AccountButton, AccountCard, AccountField, AccountFormError, AccountLink, AccountNavigation,
  AccountNotice, AccountTextLink, getFieldErrors, getFormError,
} from './account-ui.js';

const emptyRegistration = {
  firstName: '', lastName: '', email: '', dateOfBirth: '', password: '',
  street: '', number: '', neighborhood: '', locality: '', state: '', postalCode: '',
};

function fieldErrorsFrom(error) {
  const fields = getFieldErrors(error);
  const result = { ...fields };
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('address.')) result[key.slice('address.'.length)] = value;
  }
  if (error?.code === 'EMAIL_IN_USE') result.email = error.message;
  return result;
}

function PasswordField({ id, label, error, autoComplete, value, onChange, hint, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <AccountField
      id={id}
      label={label}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      maxLength={128}
      required
      value={value}
      onChange={onChange}
      error={error}
      hint={hint}
      {...inputProps}
      inputAction={(
        <button
          className="flex size-10 items-center justify-center rounded-sm text-mictlan-teal transition-colors hover:text-mictlan-teal-bright"
          type="button"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      )}
    />
  );
}

function AddressFields({ value, errors = {}, onChange }) {
  const addressFields = [
    ['street', 'Calle', 'address-line1'], ['number', 'Número exterior', 'address-line2'],
    ['neighborhood', 'Colonia', 'address-level3'], ['locality', 'Ciudad o municipio', 'address-level2'],
    ['state', 'Estado', 'address-level1'], ['postalCode', 'Código postal', 'postal-code'],
  ];
  return <div className="grid gap-5 sm:grid-cols-2">
    {addressFields.map(([name, label, autoComplete]) => <AccountField key={name} id={name} label={label} autoComplete={autoComplete} value={value[name] || ''} error={errors[name]} maxLength={120} inputMode={name === 'postalCode' ? 'numeric' : undefined} pattern={name === 'postalCode' ? '[0-9]{5}' : undefined} onChange={(event) => onChange(name, event.target.value)} />)}
  </div>;
}

export function RegistrationForm({ continueToCheckout = false }) {
  const [values, setValues] = useState(emptyRegistration);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [requestError, setRequestError] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [challenge, setChallenge] = useState(0);
  const [passwordVisibilityKey, setPasswordVisibilityKey] = useState(0);
  const resetBeforeLeaving = useCallback(() => {
    setValues(emptyRegistration);
    setErrors({});
    setNotice('');
    setRequestError('');
    setToken('');
    setChallenge((value) => value + 1);
    setPasswordVisibilityKey((value) => value + 1);
  }, []);
  useAccountViewReset(resetBeforeLeaving);
  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => { const next = { ...current }; delete next[name]; return next; });
    setRequestError('');
  };
  const onToken = useCallback((value) => setToken(value), []);

  const submit = async (event) => {
    event.preventDefault();
    setRequestError('');
    setNotice('');
    const nextErrors = validateRegistrationForm(values);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setRequestError('Revisa los campos marcados e inténtalo de nuevo.');
      return;
    }
    if (!token) { setRequestError('Completa la verificación de seguridad para crear tu cuenta.'); return; }
    setErrors({});
    setBusy(true);
    try {
      await accountRequest('auth/register', {
        method: 'POST',
        body: {
          firstName: values.firstName, lastName: values.lastName, email: values.email,
          dateOfBirth: toIsoMexicanDate(values.dateOfBirth), password: values.password,
          address: Object.fromEntries(['street', 'number', 'neighborhood', 'locality', 'state', 'postalCode'].map((name) => [name, values[name]])),
          continueToCheckout: continueToCheckout === true,
          turnstileToken: token,
        },
      });
      setNotice('Te enviamos un correo de confirmación. Abre el enlace para activar tu cuenta antes de iniciar sesión.');
      setValues(emptyRegistration);
    } catch (error) {
      setErrors(fieldErrorsFrom(error));
      setRequestError(getFormError(error));
      setValues((current) => ({ ...current, password: '' }));
      setPasswordVisibilityKey((value) => value + 1);
    } finally {
      setBusy(false);
      setToken('');
      setChallenge((value) => value + 1);
    }
  };

  if (notice) return <AccountCard eyebrow="Activa tu cuenta" title="Revisa tu correo" description="La cuenta quedará activa cuando confirmes la dirección que registraste.">
    <div className="space-y-5">
      <AccountNotice>{notice}</AccountNotice>
      <p className="text-center text-sm leading-6 text-mictlan-sage-muted">{continueToCheckout ? 'Al confirmar el enlace, iniciaremos tu sesión y te llevaremos al resumen de compra.' : 'Al confirmar el enlace, iniciaremos tu sesión y volverás a la tienda.'}</p>
      <div className="flex flex-col items-center gap-3 text-center">
        <AccountTextLink href={continueToCheckout ? '/cuenta/iniciar-sesion?continuar=checkout' : '/cuenta/iniciar-sesion'} replace>Ir a iniciar sesión</AccountTextLink>
        <AccountTextLink href="/" replace>Volver al inicio</AccountTextLink>
      </div>
    </div>
  </AccountCard>;

  return <AccountCard eyebrow="Un espacio para ti" title="Crear cuenta" description="Registra tus datos para volver a tu perfil y consultar tus pedidos." wide>
    <form className="space-y-7" noValidate onSubmit={submit}>
      {requestError && <AccountNotice variant="error">{requestError}</AccountNotice>}
      <div>
        <h2 className="mb-4 font-display text-lg text-mictlan-ivory">Información personal</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <AccountField id="firstName" label="Nombre(s)" autoComplete="given-name" required maxLength={120} value={values.firstName} error={errors.firstName} onChange={(event) => setField('firstName', event.target.value)} />
          <AccountField id="lastName" label="Apellidos" autoComplete="family-name" required maxLength={120} value={values.lastName} error={errors.lastName} onChange={(event) => setField('lastName', event.target.value)} />
          <AccountField id="email" label="Correo electrónico" type="email" autoComplete="email" required maxLength={254} value={values.email} error={errors.email} onChange={(event) => setField('email', event.target.value)} />
          <AccountDatePicker id="dateOfBirth" label="Fecha de nacimiento" value={toIsoMexicanDate(values.dateOfBirth)} onChange={(value) => setField('dateOfBirth', fromIsoMexicanDate(value))} error={errors.dateOfBirth} />
          <div className="sm:col-span-2"><PasswordField key={passwordVisibilityKey} id="password" label="Contraseña · mínimo 12 caracteres" autoComplete="new-password" value={values.password} error={errors.password} onChange={(event) => setField('password', event.target.value)} /></div>
        </div>
      </div>
      <div>
        <h2 className="mb-4 font-display text-lg text-mictlan-ivory">Domicilio</h2>
        <AddressFields value={values} errors={errors} onChange={setField} />
      </div>
      <AccountNotice>Solo aceptamos cuentas de personas mayores de 18 años. No podrás iniciar sesión hasta confirmar tu correo.</AccountNotice>
      <TurnstileWidget action="account_register" onToken={onToken} resetKey={challenge} />
      <AccountButton busy={busy} disabled={!token}>Crear mi cuenta</AccountButton>
    </form>
    <div className="mt-7 border-t border-mictlan-sand/10 pt-5 text-center text-sm text-mictlan-sage-muted">
      ¿Ya tienes cuenta? <AccountTextLink href={continueToCheckout ? '/cuenta/iniciar-sesion?continuar=checkout' : '/cuenta/iniciar-sesion'}>Iniciar sesión</AccountTextLink>
    </div>
  </AccountCard>;
}

export function PasswordRecoveryForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const resetBeforeLeaving = useCallback(() => {
    setEmail('');
    setBusy(false);
    setError('');
    setSent(false);
  }, []);
  useAccountViewReset(resetBeforeLeaving);
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await accountRequest('auth/password-reset-requests', { method: 'POST', body: { email } });
      setEmail('');
      setSent(true);
    } catch (requestError) {
      setError(getFormError(requestError));
    } finally { setBusy(false); }
  };
  return <AccountCard title="Recuperar contraseña" description={sent ? 'Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.' : 'Escribe el correo de tu cuenta. Si está registrado, te enviaremos un enlace para elegir una nueva contraseña.'}>
    <form className="space-y-5" noValidate onSubmit={submit}>
      <AccountFormError error={error} />
      {sent && <AccountNotice variant="success">Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.</AccountNotice>}
      {!sent && <>
        <AccountField id="email" label="Correo electrónico" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} />
        <AccountButton busy={busy}>Enviar instrucciones</AccountButton>
      </>}
    </form>
    <div className="mt-7 text-center"><AccountTextLink href="/cuenta/iniciar-sesion">Volver a iniciar sesión</AccountTextLink></div>
  </AccountCard>;
}

export function PasswordResetForm({ token }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenStatus, setTokenStatus] = useState(() => isOpaqueTokenShape(token) ? 'checking' : 'invalid');
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [passwordVisibilityKey, setPasswordVisibilityKey] = useState(0);
  const resetBeforeLeaving = useCallback(() => {
    setPassword('');
    setRepeat('');
    setError('');
    setPasswordVisibilityKey((value) => value + 1);
    if (success) {
      setSuccess(false);
      setTokenStatus('invalid');
    } else if (tokenStatus === 'error') {
      setTokenStatus('checking');
      setValidationAttempt((value) => value + 1);
    }
  }, [success, tokenStatus]);
  useAccountViewReset(resetBeforeLeaving);
  useEffect(() => {
    if (!isOpaqueTokenShape(token)) return undefined;
    let active = true;
    accountRequest('auth/password-reset-validations', { method: 'POST', body: { token } }).then(({ valid }) => {
      if (active) setTokenStatus(valid === true ? 'valid' : 'invalid');
    }).catch((requestError) => {
      if (active) {
        setError(getFormError(requestError, 'No pudimos verificar el enlace.'));
        setTokenStatus('error');
      }
    });
    return () => { active = false; };
  }, [token, validationAttempt]);
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (tokenStatus !== 'valid') { setError('El enlace venció o ya se utilizó. Solicita uno nuevo.'); return; }
    if (password.length < 12 || password.length > 128) { setError('La contraseña debe tener entre 12 y 128 caracteres.'); return; }
    if (password !== repeat) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try {
      await accountRequest('auth/password-resets', { method: 'POST', body: { token, password } });
      setSuccess(true);
    } catch (requestError) {
      setError(getFormError(requestError, 'El enlace venció o ya se utilizó. Solicita uno nuevo.'));
    } finally { setBusy(false); setPassword(''); setRepeat(''); setPasswordVisibilityKey((value) => value + 1); }
  };
  if (tokenStatus === 'invalid') return <AccountCard title="Enlace no válido o vencido" description="Solicita un nuevo enlace para restablecer tu contraseña."><AccountLink href="/cuenta/recuperar-contrasena">Solicitar otro enlace</AccountLink></AccountCard>;
  if (tokenStatus === 'checking') return <AccountCard title="Verificando enlace"><AccountNotice role="status">Estamos comprobando que siga vigente y no se haya utilizado.</AccountNotice></AccountCard>;
  if (tokenStatus === 'error') return <AccountCard title="No pudimos verificar el enlace"><AccountFormError error={error} /><div className="mt-4 flex flex-wrap gap-4"><button type="button" className="min-h-10 text-sm text-mictlan-teal underline underline-offset-4" onClick={() => { setError(''); setTokenStatus('checking'); setValidationAttempt((value) => value + 1); }}>Intentar de nuevo</button><AccountLink href="/cuenta/recuperar-contrasena">Solicitar otro enlace</AccountLink></div></AccountCard>;
  return <AccountCard title="Elige una nueva contraseña" description={success ? 'La contraseña se actualizó. Inicia sesión para continuar.' : 'Usa al menos 12 caracteres para proteger tu cuenta.'}>
    {success ? <AccountNotice variant="success">La contraseña se actualizó. <span className="ml-1"><AccountTextLink href="/cuenta/iniciar-sesion" replace>Iniciar sesión</AccountTextLink></span></AccountNotice> : <form className="space-y-5" noValidate onSubmit={submit}>
      <AccountFormError error={error} />
      <PasswordField key={`password-${passwordVisibilityKey}`} id="password" label="Nueva contraseña" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} />
      <PasswordField key={`repeat-${passwordVisibilityKey}`} id="repeat" label="Repite la contraseña" autoComplete="new-password" value={repeat} onChange={(event) => { setRepeat(event.target.value); setError(''); }} />
      <AccountButton busy={busy}>Guardar contraseña</AccountButton>
    </form>}
  </AccountCard>;
}

export function EmailConfirmation({ token, continueToCheckout = false }) {
  const router = useRouter();
  const session = useAccountSession();
  const confirmationRequest = useRef({ token: null, promise: null });
  const [waitingForSession, setWaitingForSession] = useState(false);
  const [status, setStatus] = useState(token ? 'loading' : 'error');
  const [message, setMessage] = useState(token ? 'Estamos verificando el enlace…' : 'El enlace de confirmación no es válido.');
  useEffect(() => {
    let active = true;
    if (!token) return undefined;
    if (confirmationRequest.current.token !== token) {
      confirmationRequest.current = { token, promise: accountRequest('auth/email-confirmations', { method: 'POST', body: { token } }) };
    }
    confirmationRequest.current.promise.then((result) => {
      if (!active) return;
      if (result.accountActivated) {
        setWaitingForSession(true);
        setStatus('success');
        setMessage(result.message || 'Tu cuenta está activa. Estamos validando tu sesión.');
        return;
      }
      setStatus('success');
      setMessage(result.message || 'El correo quedó confirmado.');
      router.replace('/cuenta');
    }).catch((error) => {
      if (!active) return;
      setStatus('error');
      setMessage(getFormError(error, 'El enlace venció o ya se utilizó.'));
    });
    return () => { active = false; };
  }, [router, token]);
  useEffect(() => {
    if (!waitingForSession) return;
    if (session.status === 'account') {
      router.replace(continueToCheckout ? '/cuenta?continuar=checkout' : '/');
    }
  }, [continueToCheckout, router, session.status, waitingForSession]);
  return <AccountCard title={status === 'success' ? 'Correo confirmado' : status === 'loading' ? 'Confirmando correo' : 'No se pudo confirmar'}>
    <AccountNotice variant={status === 'error' ? 'error' : status === 'success' ? 'success' : 'info'} role={status === 'error' ? 'alert' : 'status'}>{message}</AccountNotice>
    {waitingForSession && session.status === 'guest' && <AccountNotice variant="error">Tu cuenta quedó confirmada, pero no pudimos iniciar la sesión. <AccountTextLink href="/cuenta/iniciar-sesion">Iniciar sesión</AccountTextLink></AccountNotice>}
    {waitingForSession && session.status === 'error' && <div className="mt-4 space-y-3"><AccountNotice variant="error">No pudimos comprobar tu sesión. {session.error}</AccountNotice><AccountButton type="button" onClick={session.refresh}>Intentar de nuevo</AccountButton></div>}
    {(status === 'error' || !token) && <div className="mt-5"><AccountLink href="/">Volver a la tienda</AccountLink></div>}
  </AccountCard>;
}

const profileValues = (account) => ({
  firstName: account.firstName || '', lastName: account.lastName || '', email: account.email || '', dateOfBirth: fromIsoMexicanDate(String(account.dateOfBirth || '').slice(0, 10)),
  address: Object.fromEntries(['street', 'number', 'neighborhood', 'locality', 'state', 'postalCode'].map((field) => [field, account.address?.[field] || ''])),
});

export function ProfileForm() {
  const { account } = useAccountSession();
  const [initial, setInitial] = useState(() => profileValues(account));
  const [values, setValues] = useState(() => profileValues(account));
  const [currentPassword, setCurrentPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordVisibilityKey, setPasswordVisibilityKey] = useState(0);
  const resetBeforeLeaving = useCallback(() => {
    setValues(initial);
    setCurrentPassword('');
    setErrors({});
    setError('');
    setNotice('');
    setPasswordVisibilityKey((value) => value + 1);
  }, [initial]);
  useAccountViewReset(resetBeforeLeaving);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const emailChanged = values.email.trim().toLowerCase() !== initial.email.toLowerCase();
  const changed = hasFormChanges(initial, values) || Boolean(currentPassword && emailChanged);
  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => { const next = { ...current }; delete next[name]; return next; });
    setError('');
  };
  const setAddressField = (name, value) => {
    setValues((current) => ({ ...current, address: { ...current.address, [name]: value } }));
    setErrors((current) => { const next = { ...current }; delete next[`address.${name}`]; delete next[name]; return next; });
    setError('');
  };
  const submit = async (event) => {
    event.preventDefault();
    setError(''); setNotice(''); setErrors({});
    if (emailChanged && !currentPassword) { setErrors({ currentPassword: 'Escribe tu contraseña actual para cambiar el correo.' }); return; }
    setBusy(true);
    try {
      const body = { ...values, dateOfBirth: toIsoMexicanDate(values.dateOfBirth), currentPassword: emailChanged ? currentPassword : undefined };
      const result = await accountRequest('profile', { method: 'PATCH', body });
      const next = profileValues(result.account);
      setInitial(next); setValues(next); setCurrentPassword('');
      setNotice(emailChanged ? 'Enviamos una confirmación al nuevo correo. El correo actual seguirá vigente hasta confirmar el cambio.' : 'Guardamos los cambios de tu perfil.');
    } catch (requestError) {
      setError(getFormError(requestError));
      setErrors(fieldErrorsFrom(requestError));
      if (emailChanged) {
        setCurrentPassword('');
        setPasswordVisibilityKey((value) => value + 1);
      }
    } finally { setBusy(false); }
  };
  return <AccountCard className="account-profile-view" eyebrow="Tu espacio personal" title="Mi información" description="Mantén tus datos al día. Para cambiar el correo te pediremos tu contraseña actual." wide>
    <AccountNavigation active="profile" />
    <div className="mb-6 space-y-3">
      {account.emailVerified
        ? <AccountNotice variant="success">Correo confirmado: {account.email}</AccountNotice>
        : <AccountNotice>Te enviamos un correo de confirmación a {account.email}. Puedes usar tu cuenta mientras confirmas.</AccountNotice>}
      {account.pendingEmail && <AccountNotice>El cambio a {account.pendingEmail} está pendiente. Tu correo actual sigue activo hasta confirmar el enlace.</AccountNotice>}
      {error && <AccountNotice variant="error" role="alert">{error}</AccountNotice>}
      {notice && <AccountNotice variant="success">{notice}</AccountNotice>}
    </div>
    <form className="space-y-7" noValidate onSubmit={submit}>
      <div>
        <h2 className="mb-4 font-display text-lg text-mictlan-ivory">Información personal</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <AccountField id="firstName" label="Nombre(s)" autoComplete="given-name" required maxLength={120} value={values.firstName} error={errors.firstName} onChange={(event) => setField('firstName', event.target.value)} />
          <AccountField id="lastName" label="Apellidos" autoComplete="family-name" required maxLength={120} value={values.lastName} error={errors.lastName} onChange={(event) => setField('lastName', event.target.value)} />
          <AccountField id="email" label="Correo electrónico" type="email" autoComplete="email" required maxLength={254} value={values.email} error={errors.email} onChange={(event) => setField('email', event.target.value)} />
          <AccountDatePicker id="dateOfBirth" label="Fecha de nacimiento" value={toIsoMexicanDate(values.dateOfBirth)} onChange={(value) => setField('dateOfBirth', fromIsoMexicanDate(value))} error={errors.dateOfBirth} />
          {emailChanged && <PasswordField key={passwordVisibilityKey} id="currentPassword" label="Contraseña actual · para confirmar el correo" autoComplete="current-password" value={currentPassword} error={errors.currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />}
        </div>
      </div>
      <div>
        <h2 className="mb-4 font-display text-lg text-mictlan-ivory">Domicilio</h2>
        <AddressFields value={values.address} errors={errors} onChange={setAddressField} />
      </div>
      <AccountButton busy={busy} disabled={!changed}>Guardar cambios</AccountButton>
    </form>
    <div className="mt-7"><SignOutButton /></div>
  </AccountCard>;
}


export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [notice, setNotice] = useState('');
  const [passwordVisibilityKey, setPasswordVisibilityKey] = useState(0);
  const resetBeforeLeaving = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setError('');
    setFields({});
    setNotice('');
    setPasswordVisibilityKey((value) => value + 1);
  }, []);
  useAccountViewReset(resetBeforeLeaving);
  const setPasswordField = (field, value) => {
    if (field === 'currentPassword') setCurrentPassword(value);
    if (field === 'newPassword') setNewPassword(value);
    if (field === 'confirmation') setConfirmation(value);
    setFields((current) => { const next = { ...current }; delete next[field]; return next; });
    setError('');
  };
  const submit = async (event) => {
    event.preventDefault(); setError(''); setFields({}); setNotice('');
    const nextFields = {};
    if (!currentPassword) nextFields.currentPassword = 'Escribe tu contraseña actual.';
    if (newPassword.length < 12 || newPassword.length > 128) nextFields.newPassword = 'Usa entre 12 y 128 caracteres.';
    if (newPassword !== confirmation) nextFields.confirmation = 'Las contraseñas nuevas no coinciden.';
    if (Object.keys(nextFields).length) { setFields(nextFields); return; }
    setBusy(true);
    try {
      const result = await accountRequest('profile/password', { method: 'PATCH', body: { currentPassword, newPassword } });
      setNotice(result.message || 'Tu contraseña se actualizó.');
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
    } catch (requestError) {
      setError(getFormError(requestError));
      setFields(fieldErrorsFrom(requestError));
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
    } finally { setBusy(false); setPasswordVisibilityKey((value) => value + 1); }
  };
  return <AccountCard className="account-security-view" eyebrow="Tu espacio personal" title="Seguridad de la cuenta" description="Actualiza la contraseña asociada a tu cuenta." wide>
    <AccountNavigation active="security" />
    <p className="security-instructions mb-6 text-sm leading-6 text-mictlan-sage-muted">Confirma tu contraseña actual y elige una nueva de al menos 12 caracteres. Tu sesión actual seguirá abierta y cerraremos las demás.</p>
    <form className="security-password-form space-y-5" noValidate onSubmit={submit}>
      {error && <AccountNotice variant="error">{error}</AccountNotice>}
      {notice && <AccountNotice variant="success">{notice}</AccountNotice>}
      <div className="security-password-fields grid gap-5 sm:grid-cols-2">
        <PasswordField key={`current-${passwordVisibilityKey}`} id="currentPassword" label="Contraseña actual" autoComplete="current-password" value={currentPassword} error={fields.currentPassword} onChange={(event) => setPasswordField('currentPassword', event.target.value)} />
        <PasswordField key={`new-${passwordVisibilityKey}`} id="newPassword" label="Nueva contraseña · mínimo 12 caracteres" autoComplete="new-password" value={newPassword} error={fields.newPassword} onChange={(event) => setPasswordField('newPassword', event.target.value)} />
        <PasswordField key={`confirmation-${passwordVisibilityKey}`} id="confirmation" label="Repite la nueva contraseña" autoComplete="new-password" value={confirmation} error={fields.confirmation} onChange={(event) => setPasswordField('confirmation', event.target.value)} />
      </div>
      <AccountButton busy={busy} disabled={!currentPassword || !newPassword || !confirmation}>Cambiar contraseña</AccountButton>
    </form>
    <div className="security-signout mt-7"><SignOutButton /></div>
  </AccountCard>;
}
