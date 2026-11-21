(() => {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15_000);
  const response = fetch('/api/backend/auth/session', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  }).catch((error) => {
    if (!timedOut) throw error;
    const timeoutError = new Error('La consulta de sesión excedió el tiempo límite.');
    timeoutError.name = 'TimeoutError';
    throw timeoutError;
  }).finally(() => clearTimeout(timeoutId));

  response.catch(() => {});
  window.__mictlanSessionBootstrapResponse = response;
})();
