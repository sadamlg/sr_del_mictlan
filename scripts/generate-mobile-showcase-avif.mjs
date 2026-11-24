import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repositoryRoot, 'frontend/package.json'));
const sharp = require('sharp');
const sourcePath = join(repositoryRoot, 'frontend/public/images/mezcal-showcase-background-mobile.png');
const outputPath = join(repositoryRoot, 'frontend/.generated/r2-media/images/mezcal-showcase-background-mobile-640.avif');
const outputWidth = 640;
const maxOutputBytes = 25 * 1024;

await mkdir(dirname(outputPath), { recursive: true });

const sourceMetadata = await sharp(sourcePath).metadata();
if (!sourceMetadata.width || !sourceMetadata.height) {
  throw new Error('El fondo móvil de origen no tiene dimensiones válidas.');
}

const expectedHeight = Math.round((sourceMetadata.height * outputWidth) / sourceMetadata.width);
const result = await sharp(sourcePath)
  .resize({ width: outputWidth })
  .avif({ quality: 32, effort: 6 })
  .toFile(outputPath);

if (result.width !== outputWidth || result.height !== expectedHeight) {
  await rm(outputPath, { force: true });
  throw new Error('La variante AVIF no conserva el encuadre del fondo móvil.');
}

if (result.size > maxOutputBytes) {
  await rm(outputPath, { force: true });
  throw new Error(`La variante AVIF supera el presupuesto de ${maxOutputBytes} bytes: ${result.size}.`);
}

console.log(`Se generó ${outputPath} (${result.width}×${result.height}, ${result.size} bytes).`);
