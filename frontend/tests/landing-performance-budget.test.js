import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const mobileShowcaseImage = join(
  repositoryRoot,
  '../public/images/mezcal-showcase-background-mobile.webp',
);
const landingPage = join(repositoryRoot, '../src/app/page.js');
const landingStylesheet = join(repositoryRoot, '../src/app/globals.css');
const siteHeader = join(repositoryRoot, '../src/components/header/header.js');
const ageGate = join(repositoryRoot, '../src/components/age-gate/age-gate.js');
const rootLayout = join(repositoryRoot, '../src/app/layout.js');
const sessionBootstrap = join(repositoryRoot, '../public/account-session-bootstrap.js');
const mezcalShowcase = join(repositoryRoot, '../src/components/landing/mezcal-showcase/mezcal-showcase.js');

test('mobile showcase WebP stays within the 50 KiB transfer budget', () => {
  const sizeInBytes = statSync(mobileShowcaseImage).size;

  assert.ok(
    sizeInBytes <= 50 * 1024,
    `Expected mobile showcase WebP to stay under 50 KiB; received ${Math.ceil(sizeInBytes / 1024)} KiB`,
  );
});

test('showcase backdrop renders outside the deferred catalog boundary', () => {
  const page = readFileSync(landingPage, 'utf8');
  const sectionStart = page.indexOf('<MezcalShowcaseSection');
  const suspenseStart = page.indexOf('<Suspense');
  const sectionEnd = page.indexOf('</MezcalShowcaseSection>');

  assert.ok(sectionStart >= 0, 'Expected a synchronous showcase section shell');
  assert.ok(sectionStart < suspenseStart && suspenseStart < sectionEnd);
  assert.match(page, /fallback=\{<MezcalShowcaseSkeleton\s*\/>\}/);
});

test('first-visit entrance animations avoid non-composited filter effects', () => {
  const css = readFileSync(landingStylesheet, 'utf8');
  const header = readFileSync(siteHeader, 'utf8');

  for (const animationName of [
    'age-gate-enter',
    'age-gate-content-enter',
    'age-gate-emblem-enter',
    'fadeIn',
  ]) {
    const keyframes = css.match(new RegExp(`@keyframes ${animationName}\\s*\\{([\\s\\S]*?)\\n\\}`));

    assert.ok(keyframes, `Expected the ${animationName} keyframes to exist`);
    assert.doesNotMatch(keyframes[1], /\bfilter\s*:/, `${animationName} must not animate filter`);
  }

  assert.match(header, /animate-\[fadeIn_0\.9s_/);
  assert.doesNotMatch(header, /blurredFadeIn/);
});

test('age-gate LCP emblem is requested with high priority', () => {
  const component = readFileSync(ageGate, 'utf8');
  const emblem = component.match(/<Image\b[\s\S]*?className="age-gate-emblem[\s\S]*?\/>/)?.[0];

  assert.ok(emblem, 'Expected the age-gate emblem image to exist');
  assert.match(emblem, /loading="eager"/);
  assert.match(emblem, /fetchPriority="high"/);
  assert.doesNotMatch(emblem, /\bpreload=/);
});

test('landing preloads the age-gate LCP image before rendering page content', () => {
  const page = readFileSync(landingPage, 'utf8');
  const component = readFileSync(ageGate, 'utf8');
  const home = page.slice(page.indexOf('export default function Home'));
  const preloadIndex = home.indexOf('preload(ageGateEmblem.src');
  const renderIndex = home.indexOf('return (');

  assert.ok(preloadIndex >= 0 && preloadIndex < renderIndex);
  assert.match(home, /getImageProps/);
  assert.match(home, /imageSrcSet:\s*ageGateEmblem\.srcSet/);
  assert.match(home, /imageSizes:\s*ageGateEmblem\.sizes/);
  assert.match(home, /fetchPriority:\s*'high'/);
  assert.match(component, /AGE_GATE_EMBLEM_PATH/);
  assert.match(component, /AGE_GATE_EMBLEM_SIZES/);
});

test('account session starts before hydration using the configured API URL and is reused', () => {
  const layout = readFileSync(rootLayout, 'utf8');
  const bootstrap = readFileSync(sessionBootstrap, 'utf8');
  const accountApi = readFileSync(join(repositoryRoot, '../src/lib/account-api.js'), 'utf8');

  assert.match(layout, /<Script src="\/account-session-bootstrap\.js" strategy="beforeInteractive"\s*\/>/);
  assert.match(layout, /name="mictlan-session-endpoint" content=\{resolveAccountRequestUrl\('auth\/session'\)\}/);
  assert.match(bootstrap, /document\.querySelector\('meta\[name="mictlan-session-endpoint"\]'\)/);
  assert.match(bootstrap, /fetch\(endpoint,/);
  assert.match(bootstrap, /credentials:\s*'include'/);
  assert.match(bootstrap, /new AbortController\(\)/);
  assert.match(accountApi, /consumeSessionBootstrapResponse\(normalizedPath, method\)/);
  assert.doesNotMatch(bootstrap, /fetch\('\/api\/backend\/auth\/session'/);
});

test('product-card secondary photos reveal with opacity while remaining lazy-loaded', () => {
  const showcase = readFileSync(mezcalShowcase, 'utf8');

  assert.match(showcase, /loading="lazy"[\s\S]*?className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity/);
  assert.doesNotMatch(showcase, /clip-path/);
});
