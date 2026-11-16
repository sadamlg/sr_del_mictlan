const ALLOWED_ROUTES = new Set([
  'auth/register', 'auth/login', 'auth/logout', 'auth/session',
  'auth/password-reset-requests', 'auth/password-resets', 'auth/email-confirmations',
  'auth/password-reset-validations',
  'profile', 'profile/password', 'orders',
]);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH']);

async function proxyAccountRequest(request, context) {
  const { path = [] } = await context.params;
  const route = path.map((part) => decodeURIComponent(part)).join('/');
  if (!ALLOWED_ROUTES.has(route) || !ALLOWED_METHODS.has(request.method)) {
    return Response.json({ error: { code: 'ROUTE_NOT_FOUND', message: 'No encontramos esta ruta.' } }, { status: 404 });
  }

  const apiBase = process.env.INTERNAL_API_URL || process.env.API_INTERNAL_URL;
  if (!apiBase) {
    return Response.json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'La cuenta no está disponible. Inténtalo de nuevo.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  let target;
  try {
    const base = new URL(apiBase);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('invalid base');
    target = new URL(`/api/${route}`, base);
  } catch {
    return Response.json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'La cuenta no está disponible. Inténtalo de nuevo.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const headers = new Headers({ Accept: 'application/json' });
  for (const name of ['content-type', 'cookie', 'origin']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const contentType = upstream.headers.get('content-type');
    const setCookie = upstream.headers.get('set-cookie');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    if (setCookie) responseHeaders.set('Set-Cookie', setCookie);
    return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'No pudimos conectar con el servidor. Inténtalo de nuevo.' } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const GET = proxyAccountRequest;
export const POST = proxyAccountRequest;
export const PATCH = proxyAccountRequest;
