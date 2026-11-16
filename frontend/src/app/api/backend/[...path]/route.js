const ALLOWED_ROUTES = new Map([
  ['auth/register', new Set(['POST'])],
  ['auth/login', new Set(['POST'])],
  ['auth/logout', new Set(['POST'])],
  ['auth/session', new Set(['GET'])],
  ['auth/password-reset-requests', new Set(['POST'])],
  ['auth/password-resets', new Set(['POST'])],
  ['auth/email-confirmations', new Set(['POST'])],
  ['auth/password-reset-validations', new Set(['POST'])],
  ['profile', new Set(['GET', 'PATCH'])],
  ['profile/password', new Set(['PATCH'])],
  ['orders', new Set(['GET'])],
  ['checkout/payment-methods', new Set(['GET'])],
  ['checkout/return-status', new Set(['GET'])],
  ['checkout/sessions', new Set(['POST'])],
  ['catalog/products', new Set(['GET'])],
  ['cart/account', new Set(['GET'])],
  ['cart/account/items', new Set(['PUT'])],
  ['cart/account/merge', new Set(['POST'])],
]);

async function proxyAccountRequest(request, context) {
  const { path = [] } = await context.params;
  const route = path.map((part) => decodeURIComponent(part)).join('/');
  const removableCartItem = /^cart\/account\/items\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route);
  const reorderPaidOrder = /^orders\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/reorder$/i.test(route);
  const methodAllowed = ALLOWED_ROUTES.get(route)?.has(request.method)
    || (request.method === 'DELETE' && removableCartItem)
    || (request.method === 'POST' && reorderPaidOrder);
  if (!methodAllowed) {
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
    target.search = new URL(request.url).search;
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
export const PUT = proxyAccountRequest;
export const DELETE = proxyAccountRequest;
