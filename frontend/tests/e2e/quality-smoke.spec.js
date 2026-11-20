import AxeBuilder from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';

const test = base.extend({
  safePage: async ({ page, baseURL }, provide) => {
    const blockedWrites = [];
    const sameOrigin = new URL(baseURL).origin;

    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method().toUpperCase();

      if (url.hostname === 'challenges.cloudflare.com') {
        await route.abort();
        return;
      }

      if (url.origin === sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        if (method === 'POST' && url.pathname === '/api/visits') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ count: 1 }),
          });
          return;
        }

        if (method === 'POST' && url.pathname === '/cdn-cgi/rum') {
          await route.abort('blockedbyclient');
          return;
        }

        blockedWrites.push(`${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }

      await route.continue();
    });

    await provide({ page, blockedWrites });

    expect(blockedWrites, 'La suite no debe intentar mutaciones contra el entorno').toEqual([]);
  },
});

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoSeriousAxeViolations(page, testInfo) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  await testInfo.attach('axe-results.json', {
    body: Buffer.from(JSON.stringify(results, null, 2)),
    contentType: 'application/json',
  });
  const serious = results.violations.filter(({ impact }) => ['critical', 'serious'].includes(impact));
  expect(serious, 'axe no debe detectar violaciones críticas o serias').toEqual([]);
}

async function openAsGuest(page, path) {
  const sessionResponse = page.waitForResponse((response) => {
    return new URL(response.url()).pathname.endsWith('/auth/session');
  });
  await page.goto(path);
  await sessionResponse;
}

async function scrollToCollection(page) {
  const collection = page.locator('#coleccion');
  await expect(collection).toHaveCount(1);
  await collection.scrollIntoViewIfNeeded();
}

test('landing: edad, foco del diálogo y accesibilidad', async ({ safePage }, testInfo) => {
  const { page } = safePage;
  await openAsGuest(page, '/');
  await scrollToCollection(page);

  const dialog = page.getByRole('dialog', { name: '¿Eres mayor de edad?' });
  const confirm = page.getByRole('button', { name: 'Entrar al Mictlán' });
  const exit = page.getByRole('link', { name: 'No, salir del sitio' });

  await expect(dialog).toBeVisible();
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(exit).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirm).toBeFocused();
  await expectNoSeriousAxeViolations(page, testInfo);

  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('main')).toBeVisible();
});

test('respuestas web: encabezados de seguridad base', async ({ safePage }) => {
  const { page } = safePage;
  const response = await page.goto('/');
  const headers = response?.headers();

  expect(headers).toMatchObject({
    'strict-transport-security': 'max-age=31536000',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  });
  expect(headers['content-security-policy-report-only']).toContain("default-src 'self'");
  expect(headers['content-security-policy-report-only']).toContain('https://challenges.cloudflare.com');
  expect(headers).not.toHaveProperty('x-powered-by');
});

test('indexación: sólo se permite con opt-in explícito del entorno', async ({ safePage }) => {
  const { page } = safePage;
  const response = await page.goto('/');
  const robotsHeader = response?.headers()['x-robots-tag'] || '';
  const indexable = process.env.ROBOTS_INDEXABLE === 'true';

  if (indexable) {
    expect(robotsHeader).not.toMatch(/noindex/i);
  } else {
    expect(robotsHeader).toMatch(/noindex/i);
  }

  const accountResponse = await page.goto('/cuenta/iniciar-sesion');
  expect(accountResponse?.status()).toBe(200);
  expect(accountResponse?.headers()['x-robots-tag']).toMatch(/noindex/i);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);

  if (process.env.PLAYWRIGHT_BASE_URL) {
    const robotsResponse = await page.request.get('/robots.txt');
    expect(robotsResponse.status()).toBe(200);
    expect(await robotsResponse.text()).not.toMatch(/^\s*Disallow:\s*\/\s*$/im);
  }
});

test('landing: tamaños aprobados sin desbordamiento horizontal', async ({ safePage }) => {
  const { page } = safePage;
  await openAsGuest(page, '/');
  await expect(page.locator('#coleccion')).toHaveCount(1);

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `la landing no debe desbordar a ${width}px`).toBeLessThanOrEqual(width);
  }
});

test('landing móvil: fondo principal usa WebP y prioridad alta', async ({ safePage }) => {
  const { page } = safePage;
  await page.setViewportSize({ width: 390, height: 844 });
  await openAsGuest(page, '/');

  const collection = page.locator('#coleccion');
  const mobileWebp = collection.locator('picture source[type="image/webp"]');
  const background = collection.locator('picture img');

  await expect(mobileWebp).toHaveAttribute('srcset', /mezcal-showcase-background-mobile\.webp/);
  await expect(background).toHaveAttribute('fetchpriority', 'high');
});

test('navegación móvil: abrir y cerrar el menú', async ({ safePage }, testInfo) => {
  const { page } = safePage;
  await page.setViewportSize({ width: 390, height: 844 });
  await openAsGuest(page, '/');
  await scrollToCollection(page);
  await page.getByRole('button', { name: 'Entrar al Mictlán' }).click();

  const toggle = page.getByRole('button', { name: 'Abrir menú' });
  const navigationPanel = page.locator('#mobile-navigation');
  const navigation = page.getByRole('navigation', { name: 'Navegación móvil' });
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
  await expect(navigationPanel).toHaveAttribute('aria-hidden', 'false');
  await expect(navigation).toBeVisible();
  await expectNoSeriousAxeViolations(page, testInfo);

  await page.getByRole('button', { name: 'Cerrar menú' }).click();
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false');
  await expect(navigationPanel).toHaveAttribute('aria-hidden', 'true');
});

test('registro: campos etiquetados y validación vacía sin enviar datos', async ({ safePage }, testInfo) => {
  const { page } = safePage;
  await openAsGuest(page, '/cuenta/registro');

  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  await expect(page.getByLabel('Nombre(s)')).toBeVisible();
  await expect(page.getByLabel('Apellidos')).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear mi cuenta' })).toBeDisabled();

  await page.locator('form').evaluate((form) => form.requestSubmit());
  await expect(page.getByRole('alert').filter({ hasText: 'Revisa los campos marcados e inténtalo de nuevo.' })).toBeVisible();
  await expect(page.getByLabel('Nombre(s)')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
  await expectNoSeriousAxeViolations(page, testInfo);
  await expect(page.getByRole('button', { name: /Fecha de nacimiento.*campo obligatorio/ })).toBeVisible();
});
