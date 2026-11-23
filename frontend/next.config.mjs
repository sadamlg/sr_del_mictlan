import { shouldBypassNextImageOptimization } from './src/lib/media-url.js';
import { AGE_GATE_EMBLEM_QUALITY } from './src/components/age-gate/age-gate-image.js';

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
    qualities: [AGE_GATE_EMBLEM_QUALITY, 75],
    remotePatterns: [new URL(`${mediaBaseUrl.origin}${mediaBasePath}/**`)],
  },
  allowedDevOrigins: process.env.NEXT_ALLOWED_DEV_ORIGIN ? [process.env.NEXT_ALLOWED_DEV_ORIGIN] : [],
};
export default nextConfig;
