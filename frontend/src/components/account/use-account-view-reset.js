'use client';

import { useEffect, useRef } from 'react';
import { shouldResetAccountView } from '../../lib/account-navigation-state.js';

export default function useAccountViewReset(resetView) {
  const resetViewRef = useRef(resetView);

  useEffect(() => {
    resetViewRef.current = resetView;
  }, [resetView]);

  useEffect(() => {
    const handleLinkNavigation = (event) => {
      if (shouldResetAccountView(event, window.location.href)) resetViewRef.current('link');
    };
    const handleHistoryNavigation = () => resetViewRef.current('history');

    document.addEventListener('click', handleLinkNavigation, true);
    window.addEventListener('popstate', handleHistoryNavigation);
    return () => {
      document.removeEventListener('click', handleLinkNavigation, true);
      window.removeEventListener('popstate', handleHistoryNavigation);
    };
  }, []);
}
