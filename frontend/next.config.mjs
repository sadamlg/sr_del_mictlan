import { shouldBypassNextImageOptimization } from './src/lib/media-url.js';

const mediaBaseUrl = new URL(process.env.MEDIA_BASE_URL || 'http://localhost:3000');
const mediaBasePath = mediaBaseUrl.pathname.replace(/\/+$/, '');
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaBaseUrl.origin}`,
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://maps.google.com https://www.google.com",
].join('; ');
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicyReportOnly },
];
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    unoptimized: shouldBypassNextImageOptimization(mediaBaseUrl.href),
    remotePatterns: [new URL(`${mediaBaseUrl.origin}${mediaBasePath}/**`)],
  },
  allowedDevOrigins: process.env.NEXT_ALLOWED_DEV_ORIGIN ? [process.env.NEXT_ALLOWED_DEV_ORIGIN] : [],
};
export default nextConfig;
