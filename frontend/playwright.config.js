import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const remoteTarget = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const useProductionBuild = process.env.PLAYWRIGHT_USE_PRODUCTION === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  ...(remoteTarget ? {} : {
    webServer: {
      command: useProductionBuild ? 'npm run start -- --port 3100' : 'npm run dev -- --port 3100',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        INTERNAL_API_URL: '',
        NEXT_ALLOWED_DEV_ORIGIN: '127.0.0.1',
        NEXT_PUBLIC_API_PROXY_PATH: '/api/backend',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
        ROBOTS_INDEXABLE: process.env.ROBOTS_INDEXABLE || 'false',
      },
    },
  }),
});
