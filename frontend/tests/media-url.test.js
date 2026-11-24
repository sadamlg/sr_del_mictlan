import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert/strict');
const test = require('node:test');

test('local and private LAN media use relative paths for local file fallback', async () => {
  const { mediaObjectUrl } = await import('../src/lib/media-url.js');

  for (const base of ['', 'http://localhost:3000', 'http://192.168.100.11:3000/']) {
    assert.equal(
      mediaObjectUrl(base, 'images/brand/senor-del-mictlan-brand.png', { allowInsecureDevHttp: true }),
      '/images/brand/senor-del-mictlan-brand.png',
    );
  }
});

test('public media keep their external origin and optional base path', async () => {
  const { mediaObjectUrl } = await import('../src/lib/media-url.js');

  assert.equal(
    mediaObjectUrl('https://media.example.test/staging/', 'images/hero-background.png'),
    'https://media.example.test/staging/images/hero-background.png',
  );
});

test('media preconnect uses only the secure origin and omits the object path', async () => {
  const { mediaOrigin } = await import('../src/lib/media-url.js');

  assert.equal(mediaOrigin('https://media.example.test/staging/'), 'https://media.example.test');
});

test('media preconnect skips empty, insecure, malformed, or credential-bearing URLs', async () => {
  const { mediaOrigin } = await import('../src/lib/media-url.js');

  for (const base of ['', 'http://localhost:9000', 'not-a-url', 'https://user:secret@media.example.test']) {
    assert.equal(mediaOrigin(base), null);
  }
});

test('media base URLs cannot include credentials or query parameters', async () => {
  const { mediaObjectUrl } = await import('../src/lib/media-url.js');

  assert.throws(() => mediaObjectUrl('https://user:secret@media.example.test', 'images/hero-background.png'));
  assert.throws(() => mediaObjectUrl('https://media.example.test?token=secret', 'images/hero-background.png'));
  assert.throws(() => mediaObjectUrl('http://localhost:3000', 'images/hero-background.png', { allowInsecureDevHttp: false }));
  assert.throws(() => mediaObjectUrl('ftp://media.example.test', 'images/hero-background.png'));
  assert.throws(() => mediaObjectUrl('https://media.example.test', '../private.png'));
});

test('responsive candidates keep the R2 origin and include the original full-size WebP', async () => {
  const { mediaRenditionSrcSet } = await import('../src/lib/media-url.js');

  assert.equal(
    mediaRenditionSrcSet(
      'https://media.example.test/images/mezcal-showcase-background-mobile.webp',
      [320],
      640,
    ),
    'https://media.example.test/images/mezcal-showcase-background-mobile-320.webp 320w, https://media.example.test/images/mezcal-showcase-background-mobile.webp 640w',
  );
});
