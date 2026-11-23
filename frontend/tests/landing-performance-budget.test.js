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
const mobileShowcaseAvif = join(repositoryRoot, '../public/images/mezcal-showcase-background-mobile.avif');
const favicon = join(repositoryRoot, '../src/app/favicon.ico');
const optimizedAgeGateImage = join(repositoryRoot, '../public/images/age-gate/skull-optimized.webp');
const landingPage = join(repositoryRoot, '../src/app/page.js');
const landingStylesheet = join(repositoryRoot, '../src/app/globals.css');
const siteHeader = join(repositoryRoot, '../src/components/header/header.js');
const landingHero = join(repositoryRoot, '../src/components/landing/landing-hero.js');
const ageGate = join(repositoryRoot, '../src/components/age-gate/age-gate.js');
const ageGateImage = join(repositoryRoot, '../src/components/age-gate/age-gate-image.js');
const rootLayout = join(repositoryRoot, '../src/app/layout.js');
const sessionBootstrap = join(repositoryRoot, '../public/account-session-bootstrap.js');
const mezcalShowcase = join(repositoryRoot, '../src/components/landing/mezcal-showcase/mezcal-showcase.js');
const nextConfig = join(repositoryRoot, '../next.config.mjs');

test('mobile showcase WebP stays within the 50 KiB transfer budget', () => {
  const sizeInBytes = statSync(mobileShowcaseImage).size;

  assert.ok(
    sizeInBytes <= 50 * 1024,
    `Expected mobile showcase WebP to stay under 50 KiB; received ${Math.ceil(sizeInBytes / 1024)} KiB`,
  );
});

test('mobile showcase AVIF and favicon stay within transfer budgets', () => {
  assert.ok(statSync(mobileShowcaseAvif).size <= 25 * 1024);
  assert.ok(statSync(favicon).size <= 20 * 1024);
});

test('age-gate emblem stays within the 25 KiB transfer budget', () => {
  assert.ok(statSync(optimizedAgeGateImage).size <= 25 * 1024);
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

test('age-gate decorative emblem loads eagerly with high priority', () => {
  const component = readFileSync(ageGate, 'utf8');
  const emblem = component.match(/<Image\b[\s\S]*?className="age-gate-emblem[\s\S]*?\/>/)?.[0];

  assert.ok(emblem, 'Expected the age-gate emblem image to exist');
  assert.match(emblem, /loading="eager"/);
  assert.match(emblem, /fetchPriority="high"/);
  assert.doesNotMatch(emblem, /\bpreload=/);
});

test('landing preloads the mobile age-gate emblem and showcase background', () => {
  const page = readFileSync(landingPage, 'utf8');
  const component = readFileSync(ageGate, 'utf8');
  const imageConstants = readFileSync(ageGateImage, 'utf8');
  assert.match(page, /href=\{AGE_GATE_EMBLEM_PATH\}/);
  assert.match(page, /MOBILE_SHOWCASE_BACKGROUND_AVIF_PATH/);
  assert.match(component, /AGE_GATE_EMBLEM_PATH/);
  assert.match(component, /AGE_GATE_EMBLEM_SIZES/);
  assert.match(component, /unoptimized/);
  assert.match(imageConstants, /AGE_GATE_EMBLEM_PATH\s*=\s*'\/images\/age-gate\/skull-optimized\.webp'/);
});

test('Next image optimizer uses its default quality', () => {
  const config = readFileSync(nextConfig, 'utf8');

  assert.doesNotMatch(config, /AGE_GATE_EMBLEM_QUALITY/);
});

test('landing preloads the mobile AVIF and retains a WebP fallback', () => {
  const page = readFileSync(landingPage, 'utf8');
  const showcase = readFileSync(mezcalShowcase, 'utf8');

  assert.match(page, /href=\{mediaObjectUrl\(mediaBaseUrl, MOBILE_SHOWCASE_BACKGROUND_AVIF_PATH\)\}/);
  assert.match(page, /type="image\/avif"[\s\S]*?media="\(max-width: 640px\)"[\s\S]*?fetchPriority="high"/);
  assert.match(showcase, /type="image\/avif"[\s\S]*?type="image\/webp"/);
});

test('landing gives non-LCP hero and header images low fetch priority', () => {
  const hero = readFileSync(landingHero, 'utf8');
  const header = readFileSync(siteHeader, 'utf8');
  const showcase = readFileSync(mezcalShowcase, 'utf8');

  assert.match(hero, /fetchPriority:\s*'low'/);
  assert.match(header, /priority=\{!isLandingPage\}/);
  assert.match(header, /loading=\{isLandingPage \? 'eager' : undefined\}/);
  assert.match(header, /fetchPriority=\{isLandingPage \? 'low' : 'high'\}/);
  assert.match(showcase, /fetchPriority="high" className="absolute inset-0 h-full w-full object-cover"/);
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
