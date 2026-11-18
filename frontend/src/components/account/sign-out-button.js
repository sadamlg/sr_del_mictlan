'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { accountRequest } from '../../lib/account-api.js';
import useAccountViewReset from './use-account-view-reset.js';

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useAccountViewReset(() => setError(''));
  const signOut = async () => {
    setBusy(true);
    setError('');
    try {
      await accountRequest('auth/logout', { method: 'POST' });
      router.replace('/');
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };
  return <div className="text-center">
    <button className="font-ui text-xs uppercase tracking-[0.12em] text-mictlan-sage-muted underline decoration-mictlan-sand/25 underline-offset-4 hover:text-mictlan-ivory" type="button" disabled={busy} onClick={signOut}>
      {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
    {error && <p className="mt-2 text-xs text-mictlan-error-text" role="alert">{error}</p>}
  </div>;
}
