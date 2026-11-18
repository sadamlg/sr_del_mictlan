import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.js';

async function withApi(database, callback, options = {}) {
  const server = createApp({ database, ...options }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('GET /health reports PostgreSQL connectivity', async () => {
  await withApi({ $queryRaw: async () => [{ result: 1 }] }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
  });
});

test('GET /health returns unavailable when PostgreSQL cannot be queried', async () => {
  await withApi({ $queryRaw: async () => { throw new Error('database unavailable'); } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable', database: 'disconnected' });
  });
});

test('GET /api/hello returns the frontend communication contract', async () => {
  await withApi({ $queryRaw: async () => [{ result: 1 }] }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hello`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: 'backend',
      message: 'Frontend y backend se comunican.',
    });
  });
});

test('GET /api/public-config exposes the public Checkout availability flag', async () => {
  for (const [checkoutEnabled, expected] of [[undefined, false], ['false', false], ['true', true]]) {
    await withApi({ $queryRaw: async () => [{ result: 1 }] }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/public-config`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { checkoutEnabled: expected });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }, {
      environment: {
        NODE_ENV: 'test',
        FRONTEND_ORIGIN: 'http://shop.example.test',
        ...(checkoutEnabled === undefined ? {} : { CHECKOUT_ENABLED: checkoutEnabled }),
      },
    });
  }
});

test('production Checkout stays unavailable until explicitly enabled', async () => {
  await withApi({ $queryRaw: async () => [{ result: 1 }] }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/checkout/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: 'CHECKOUT_DISABLED', message: 'El checkout no está disponible.' },
    });
  }, {
    environment: { NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://shop.example.test' },
  });
});
