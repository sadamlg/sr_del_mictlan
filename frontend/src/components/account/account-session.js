'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ACCOUNT_SESSION_CHANGED_EVENT } from '../../lib/account-api.js';
import { loadAccountSession } from '../../lib/account-session-state.js';
export { loadAccountSession } from '../../lib/account-session-state.js';

const AccountSessionContext = createContext(null);

export function AccountSessionProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', account: null, error: '' });
  const refresh = useCallback(async () => {
    setSession((current) => ({ ...current, status: current.account ? 'refreshing' : 'loading' }));
    const next = await loadAccountSession();
    setSession(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const next = await loadAccountSession();
      if (active) setSession(next);
    };
    const onSessionChange = () => {
      setSession((current) => ({ ...current, status: current.account ? 'refreshing' : 'loading' }));
      void restore();
    };
    void restore();
    window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, onSessionChange);
    return () => {
      active = false;
      window.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, onSessionChange);
    };
  }, []);

  const value = useMemo(() => ({ ...session, refresh }), [session, refresh]);
  return createElement(AccountSessionContext.Provider, { value }, children);
}

export function useAccountSession() {
  const context = useContext(AccountSessionContext);
  if (!context) throw new Error('useAccountSession debe usarse dentro de AccountSessionProvider.');
  return context;
}
