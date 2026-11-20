import { shouldBypassNextImageOptimization } from './src/lib/media-url.js';

const mediaBaseUrl = new URL(process.env.MEDIA_BASE_URL || 'http://localhost:3000');
const mediaBasePath = mediaBaseUrl.pathname.replace(/\/+$/, '');
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  ...(process.env.NEXT_BUILD_ID ? { generateBuildId: async () => process.env.NEXT_BUILD_ID } : {}),
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
