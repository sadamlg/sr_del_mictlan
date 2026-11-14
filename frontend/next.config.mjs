import { shouldBypassNextImageOptimization } from './src/lib/media-url.js';

const mediaBaseUrl = new URL(process.env.MEDIA_BASE_URL || 'http://localhost:3000');
const mediaBasePath = mediaBaseUrl.pathname.replace(/\/+$/, '');
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    unoptimized: shouldBypassNextImageOptimization(mediaBaseUrl.href),
    remotePatterns: [new URL(`${mediaBaseUrl.origin}${mediaBasePath}/**`)],
  },
  allowedDevOrigins: process.env.NEXT_ALLOWED_DEV_ORIGIN ? [process.env.NEXT_ALLOWED_DEV_ORIGIN] : [],
};
export default nextConfig;
