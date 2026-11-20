import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const mobileShowcaseImage = join(
  repositoryRoot,
  '../public/images/mezcal-showcase-background-mobile.webp',
);

test('mobile showcase WebP stays within the 100 KiB transfer budget', () => {
  const sizeInBytes = statSync(mobileShowcaseImage).size;

  assert.ok(
    sizeInBytes <= 100 * 1024,
    `Expected mobile showcase WebP to stay under 100 KiB; received ${Math.ceil(sizeInBytes / 1024)} KiB`,
  );
});
