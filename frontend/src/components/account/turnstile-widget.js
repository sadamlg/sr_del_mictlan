'use client';

import { useEffect, useRef, useState } from 'react';
import { AccountNotice } from './account-ui.js';

const SCRIPT_ID = 'cloudflare-turnstile-script';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export default function TurnstileWidget({ action, onToken, resetKey }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const completedRef = useRef(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [status, setStatus] = useState(siteKey ? 'loading' : 'missing');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!siteKey) return undefined;

    let disposed = false;
    let pollId;
    let timeoutId;
    let widgetRendered = false;
    let script = document.getElementById(SCRIPT_ID);
    completedRef.current = false;
    const renderWidget = () => {
      if (disposed || !containerRef.current || !window.turnstile) return false;
      if (widgetRendered) return true;
      containerRef.current.replaceChildren();
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: (token) => { completedRef.current = true; onToken(token); },
        'expired-callback': () => { completedRef.current = false; onToken(''); setStatus('ready'); },
        'error-callback': () => { completedRef.current = false; onToken(''); setStatus('error'); return true; },
      });
      widgetRendered = true;
      window.clearTimeout(timeoutId);
      setStatus('ready');
      return true;
    };

    if (window.turnstile && renderWidget()) return () => {
      disposed = true;
      if (widgetIdRef.current && !completedRef.current) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };

    if (script && !window.turnstile && (retry || resetKey || script.dataset.loaded === 'true')) {
      script.remove();
      script = null;
    }
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
    const onLoad = () => { script.dataset.loaded = 'true'; if (!renderWidget()) setStatus('error'); };
    const onError = () => { if (!disposed) setStatus('error'); };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    timeoutId = window.setTimeout(() => { if (!disposed && !widgetRendered) setStatus('error'); }, 12_000);
    pollId = window.setInterval(() => { if (renderWidget()) window.clearInterval(pollId); }, 100);

    return () => {
      disposed = true;
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (widgetIdRef.current && !completedRef.current) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [action, onToken, resetKey, retry, siteKey]);

  return (
    <div className="space-y-2 text-center" role="group" aria-label="Verificación de seguridad">
      <p className="font-ui text-xs uppercase tracking-[0.1em] text-mictlan-sage-muted">Verificación de seguridad</p>
      {status !== 'missing' && <div ref={containerRef} className="flex min-h-[65px] justify-center" />}
      {status === 'missing' && <p className="font-ui text-xs leading-5 text-mictlan-error-text" role="alert">La verificación de seguridad no está configurada. Inténtalo más tarde.</p>}
      {status === 'loading' && <p className="text-sm text-mictlan-sage-muted" role="status">Cargando la verificación…</p>}
      {status === 'error' && <div className="space-y-2"><AccountNotice variant="error" role="alert">No pudimos cargar la verificación. Revisa tu conexión e inténtalo de nuevo.</AccountNotice><button type="button" className="min-h-10 text-sm text-mictlan-teal underline underline-offset-4 hover:text-mictlan-bone" onClick={() => { setStatus('loading'); setRetry((value) => value + 1); }}>Reintentar verificación</button></div>}
    </div>
  );
}
