const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000;
export const ACCOUNT_SESSION_CHANGED_EVENT = 'mictlan:account-session-changed';

export class AccountApiError extends Error {
  constructor({ status, error }) {
    super(error?.message || 'No se pudo completar la solicitud. Inténtalo de nuevo.');
    this.name = 'AccountApiError';
    this.status = status;
    this.code = error?.code || 'REQUEST_FAILED';
    this.fields = error?.fields && typeof error.fields === 'object' ? error.fields : {};
  }
}

function consumeSessionBootstrapResponse(path, method) {
  if (path !== 'auth/session' || method !== 'GET' || typeof window === 'undefined') return null;
  const response = window.__mictlanSessionBootstrapResponse;
  if (!response) return null;
  delete window.__mictlanSessionBootstrapResponse;
  return response;
}

export function resolveAccountRequestUrl(path, {
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL,
  apiProxyPath = process.env.NEXT_PUBLIC_API_PROXY_PATH,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const normalizedPath = String(path).replace(/^\/+/, '');
  const proxyPath = apiProxyPath || (nodeEnv === 'production' ? '/api/backend' : '');
  if (proxyPath) return `${proxyPath.replace(/\/+$/, '')}/${normalizedPath}`;
  const baseUrl = apiBaseUrl || 'http://localhost:4000';
  return `${baseUrl.replace(/\/+$/, '')}/api/${normalizedPath}`;
}

function notifyAccountSessionChanged(path, method) {
  const sessionChangingRequest = method === 'POST' && [
    'auth/login', 'auth/logout', 'auth/email-confirmations', 'auth/password-resets',
  ].includes(path);
  const profileChanged = method === 'PATCH' && ['profile', 'profile/password'].includes(path);
  if (typeof window !== 'undefined' && (sessionChangingRequest || profileChanged)) {
    window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED_EVENT));
  }
}

function requiresAccountSession(path) {
  return path === 'orders' || path.startsWith('orders/') ||
    path === 'checkout' || path.startsWith('checkout/') ||
    path === 'cart/account' || path.startsWith('cart/account/');
}

function notifyAccountSessionExpired(path, status) {
  if (status === 401 && requiresAccountSession(path) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED_EVENT));
  }
}

export async function accountRequest(path, { method = 'GET', body, signal } = {}) {
  const normalizedPath = String(path).replace(/^\/+/, '');
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ACCOUNT_REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });

  let response;
  let payload;
  try {
    const bootstrapResponse = consumeSessionBootstrapResponse(normalizedPath, method);
    response = bootstrapResponse
      ? await bootstrapResponse
      : await fetch(resolveAccountRequestUrl(normalizedPath), {
        method,
        credentials: 'include',
        cache: 'no-store',
        headers: body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    }
  } catch (error) {
    throw new AccountApiError({
      status: 0,
      error: timedOut || error?.name === 'TimeoutError'
        ? { code: 'REQUEST_TIMEOUT', message: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.' }
        : { code: 'NETWORK_ERROR', message: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.' },
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (response.status === 204) {
    notifyAccountSessionChanged(normalizedPath, method);
    return null;
  }
  if (!response.ok) {
    notifyAccountSessionExpired(normalizedPath, response.status);
    throw new AccountApiError({ status: response.status, error: payload?.error });
  }
  notifyAccountSessionChanged(normalizedPath, method);
  return payload;
}
