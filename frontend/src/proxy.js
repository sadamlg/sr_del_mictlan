import { NextResponse } from 'next/server';
import cspHashes from '../.generated/csp-hashes.js';

function buildContentSecurityPolicy(nonce) {
  const mediaOrigin = new URL(process.env.MEDIA_BASE_URL || 'http://localhost:3000').origin;
  const scriptHashes = cspHashes.scripts.map((hash) => `'${hash}'`);
  const styleAttributeHashes = cspHashes.styleAttributes.map((hash) => `'${hash}'`);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' ${scriptHashes.join(' ')} https://challenges.cloudflare.com`,
    "script-src-attr 'none'",
    "style-src 'self'",
    `style-src-attr ${styleAttributeHashes.length ? `'unsafe-hashes' ${styleAttributeHashes.join(' ')}` : "'none'"}`,
    `img-src 'self' data: blob: ${mediaOrigin}`,
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com https://maps.google.com https://www.google.com",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const isRobotsFile = pathname === '/robots.txt';
  const isApprovedPublicPage = pathname === '/';
  if (isRobotsFile) return NextResponse.next();

  const isApiRequest = pathname === '/api' || pathname.startsWith('/api/');
  const isNextAsset = pathname === '/_next' || pathname.startsWith('/_next/');
  const isVercelAsset = pathname.startsWith('/_vercel/');
  const isFileRequest = /\.[^/]+$/.test(pathname);
  const isDocumentRequest = ['GET', 'HEAD'].includes(request.method)
    && !isApiRequest
    && !isNextAsset
    && !isVercelAsset
    && !isFileRequest;
  const requestHeaders = new Headers(request.headers);
  let response;

  if (isDocumentRequest && process.env.NODE_ENV === 'production') {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  } else {
    response = NextResponse.next();
  }

  const publicPageCanBeIndexed = isApprovedPublicPage && process.env.ROBOTS_INDEXABLE === 'true';
  if (!publicPageCanBeIndexed) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}
