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
  allowedDevOrigins: process.env.NEXT_ALLOWED_DEV_ORIGIN ? [process.env.NEXT_ALLOWED_DEV_ORIGIN] : [],
};
export default nextConfig;
