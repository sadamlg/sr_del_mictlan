import Link from 'next/link';

export const ACCOUNT_INPUT_CLASS = 'w-full rounded-sm border border-mictlan-sand/20 bg-mictlan-carbon/30 px-3.5 py-3 font-sans text-sm text-mictlan-ivory placeholder:text-mictlan-earth-muted';

export function AccountCard({ eyebrow = 'Tu cuenta', title, description, children, wide = false, className = '' }) {
  return (
    <section className={`mx-auto w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} selection:bg-mictlan-teal selection:text-mictlan-ink [&_a:focus-visible]:outline-mictlan-teal [&_button:focus-visible]:outline-mictlan-teal [&_input:focus-visible]:outline-mictlan-teal ${className}`}>
      <div className="mb-7 text-center">
        <p className="font-ui text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-mictlan-teal">{eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-normal leading-tight text-mictlan-ivory sm:text-4xl">{title}</h1>
        {description && <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-mictlan-sage-muted">{description}</p>}
      </div>
      <div className="border border-mictlan-teal/25 bg-mictlan-background/90 px-5 py-6 shadow-[0_24px_70px_rgba(0,0,0,0.32)] sm:px-8 sm:py-8">
        {children}
      </div>
    </section>
  );
}

export function AccountField({ id, label, error, hint, className = '', children, labelAction, inputIcon, inputAction, ...inputProps }) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const inputClassName = `${ACCOUNT_INPUT_CLASS} focus:border-mictlan-teal ${inputIcon ? 'pl-10' : ''} ${inputAction ? 'pr-12' : ''} ${error ? 'border-mictlan-red/70' : ''} ${inputProps.disabled ? 'disabled:opacity-60' : ''}`;
  const input = (
    <input
      {...inputProps}
      id={id}
      className={inputClassName}
      aria-invalid={Boolean(error)}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
    />
  );

  return (
    <div className={`block font-ui text-xs font-medium tracking-[0.03em] text-mictlan-sand ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      {hint && <p id={hintId} className="mt-1 font-sans text-xs leading-5 text-mictlan-sage-muted">{hint}</p>}
      <div className="relative mt-2">
        {children || input}
        {inputIcon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true">{inputIcon}</span>}
        {inputAction && <span className="absolute right-1 top-1/2 -translate-y-1/2">{inputAction}</span>}
      </div>
      {error && <span id={errorId} className="mt-1 block font-sans text-xs leading-5 text-mictlan-error-text">{error}</span>}
    </div>
  );
}

export function AccountNotice({ children, variant = 'info', role }) {
  const styles = variant === 'error'
    ? 'border-mictlan-red/45 bg-mictlan-burgundy/20 text-mictlan-error-text-muted'
    : variant === 'success'
      ? 'border-mictlan-teal/30 bg-mictlan-teal-deep/20 text-mictlan-teal'
      : 'border-mictlan-teal/25 bg-mictlan-teal-deep/15 text-mictlan-sage-muted';
  return <div className={`border px-4 py-3 text-sm leading-6 ${styles}`} role={role || (variant === 'error' ? 'alert' : 'status')}>{children}</div>;
}

export function AccountButton({ children, busy = false, disabled = false, type = 'submit', variant = 'primary', ...props }) {
  const secondary = variant === 'secondary';
  const style = secondary
    ? 'border border-mictlan-sand/25 bg-transparent text-mictlan-sage-muted hover:border-mictlan-teal/40 hover:text-mictlan-teal'
    : 'border border-mictlan-teal/35 bg-mictlan-teal-deep text-mictlan-bone shadow-[0_8px_24px_color-mix(in_srgb,var(--mictlan-teal-deep)_30%,transparent)] hover:bg-mictlan-teal-hover disabled:border-mictlan-earth/35 disabled:bg-mictlan-earth/15 disabled:text-mictlan-sage-muted/55 disabled:shadow-none disabled:hover:bg-mictlan-earth/15';
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`flex min-h-12 w-full items-center justify-center gap-2 border px-5 py-3 font-ui text-xs font-semibold uppercase tracking-[0.16em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mictlan-teal disabled:cursor-not-allowed ${busy ? 'cursor-wait disabled:cursor-wait' : ''} ${style}`}
      {...props}
    >
      {busy ? 'Un momento…' : children}
    </button>
  );
}

export function AccountLink({ href, children, className = '' }) {
  return <Link href={href} className={`inline-flex min-h-10 items-center text-sm text-mictlan-teal underline decoration-mictlan-teal/50 underline-offset-4 hover:text-mictlan-bone focus-visible:rounded-sm ${className}`}>{children}</Link>;
}

export function AccountTextLink({ href, children, onClick, replace = false }) {
  return <Link href={href} replace={replace} onClick={onClick} className="font-ui text-xs font-medium tracking-wide text-mictlan-teal decoration-mictlan-teal/40 underline underline-offset-4 transition-colors hover:text-mictlan-teal-bright hover:decoration-mictlan-teal">{children}</Link>;
}

export function AccountNavigation({ active }) {
  const items = [
    { href: '/cuenta', label: 'Información personal', key: 'profile' },
    { href: '/cuenta/seguridad', label: 'Contraseña', key: 'security' },
    { href: '/cuenta/pedidos', label: 'Mis pedidos', key: 'orders' },
  ];
  return (
    <nav className="mb-6 grid grid-cols-3 border-b border-mictlan-sand/15 sm:flex" aria-label="Secciones de tu cuenta">
      {items.map((item) => (
        <Link
          key={item.key}
          aria-current={active === item.key ? 'page' : undefined}
          className={`flex min-h-12 min-w-0 items-center justify-center border-b-2 px-1 py-2 text-center font-ui text-[0.6rem] font-semibold uppercase leading-tight tracking-[0.08em] transition-colors sm:min-h-0 sm:shrink-0 sm:justify-start sm:whitespace-nowrap sm:px-6 sm:py-3 sm:text-xs sm:leading-normal sm:tracking-[0.12em] ${active === item.key ? 'border-mictlan-teal text-mictlan-teal' : 'border-transparent text-mictlan-sage-muted hover:text-mictlan-ivory'}`}
          href={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AccountFormError({ error }) {
  if (!error) return null;
  return <AccountNotice variant="error" role="alert">{error}</AccountNotice>;
}

export function getFormError(error, fallback = 'No pudimos guardar los cambios. Revisa los datos e inténtalo de nuevo.') {
  return error?.message || fallback;
}

export function getFieldErrors(error) {
  return error?.fields || {};
}
