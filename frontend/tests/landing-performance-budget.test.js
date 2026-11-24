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
const favicon = join(repositoryRoot, '../src/app/favicon.ico');
const optimizedAgeGateImage = join(repositoryRoot, '../public/images/age-gate/skull-optimized.webp');
const landingPage = join(repositoryRoot, '../src/app/page.js');
const landingStylesheet = join(repositoryRoot, '../src/app/globals.css');
const siteHeader = join(repositoryRoot, '../src/components/header/header.js');
const landingHero = join(repositoryRoot, '../src/components/landing/landing-hero.js');
const ageGate = join(repositoryRoot, '../src/components/age-gate/age-gate.js');
const rootLayout = join(repositoryRoot, '../src/app/layout.js');
const sessionBootstrap = join(repositoryRoot, '../public/account-session-bootstrap.js');
const mezcalShowcase = join(repositoryRoot, '../src/components/landing/mezcal-showcase/mezcal-showcase.js');
const mediaGenerator = join(repositoryRoot, '../../scripts/generate-r2-media-renditions.sh');
const mobileAvifGenerator = join(repositoryRoot, '../../scripts/generate-mobile-showcase-avif.mjs');
const responsiveMediaImage = join(repositoryRoot, '../src/components/media/responsive-media-image.js');
const developmentDockerIgnore = join(repositoryRoot, '../.dockerignore');
const productionDockerIgnore = join(repositoryRoot, '../Dockerfile.production.dockerignore');

test('mobile showcase WebP stays within the 50 KiB transfer budget', () => {
  const sizeInBytes = statSync(mobileShowcaseImage).size;

  assert.ok(
    sizeInBytes <= 50 * 1024,
    `Expected mobile showcase WebP to stay under 50 KiB; received ${Math.ceil(sizeInBytes / 1024)} KiB`,
  );
});

test('favicon stays within its 20 KiB transfer budget', () => {
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

test('age-gate LCP emblem loads eagerly with high fetch priority', () => {
  const component = readFileSync(ageGate, 'utf8');
  const emblem = component.match(/<ResponsiveMediaImage\b[\s\S]*?className="absolute inset-0 h-full w-full age-gate-emblem[\s\S]*?\/>/)?.[0];

  assert.ok(emblem, 'Expected the age-gate emblem image to exist');
  assert.match(emblem, /loading="eager"/);
  assert.match(emblem, /fetchPriority="high"/);
  assert.doesNotMatch(emblem, /\bpreload=/);
});

test('age-gate entry avoids a full-screen backdrop filter and non-composited focus-color transition', () => {
  const component = readFileSync(ageGate, 'utf8');
  const overlay = component.match(/className="age-gate-overlay[^"]*"/)?.[0];
  const primaryButton = component.match(/className="age-gate-primary[^"]*"/)?.[0];

  assert.ok(overlay, 'Expected the age-gate overlay to exist');
  assert.doesNotMatch(overlay, /backdrop-blur/);
  assert.ok(primaryButton, 'Expected the age-gate primary button to exist');
  assert.match(primaryButton, /transition-\[background-color\]/);
  assert.doesNotMatch(primaryButton, /transition-colors/);
});

test('landing preloads the age-gate LCP image and the mobile showcase image', () => {
  const page = readFileSync(landingPage, 'utf8');
  const component = readFileSync(ageGate, 'utf8');

  assert.match(page, /href=\{ageGateEmblemUrl\}/);
  assert.match(page, /imageSrcSet=\{mediaRenditionSrcSet\(ageGateEmblemUrl, AGE_GATE_EMBLEM_WIDTHS, AGE_GATE_EMBLEM_SOURCE_WIDTH\)\}/);
  assert.match(page, /imageSizes=\{AGE_GATE_EMBLEM_SIZES\}/);
  assert.match(page, /type="image\/webp"[\s\S]*?fetchPriority="high"/);
  assert.match(page, /href=\{mobileShowcaseAvifUrl\}/);
  assert.match(page, /imageSrcSet=\{`\$\{mobileShowcaseAvifUrl\} \$\{MOBILE_SHOWCASE_BACKGROUND_AVIF_WIDTH\}w`\}/);
  assert.match(page, /type="image\/avif"[\s\S]*?fetchPriority="high"/);
  assert.match(component, /AGE_GATE_EMBLEM_PATH/);
  assert.match(component, /fetchPriority="high"/);
});

test('responsive WebP generation uses its configured quality', () => {
  const script = readFileSync(mediaGenerator, 'utf8');

  assert.match(script, /-quality "?\$\{quality\}"?/);
  assert.match(script, /webp:alpha-quality=100/);
  assert.match(script, /\.generated\/r2-media\/images/);
  assert.doesNotMatch(script, /frontend\/public\/images\/\$\{relative_source\}/);
});

test('landing prefers the mobile AVIF while retaining responsive WebP and PNG fallbacks', () => {
  const page = readFileSync(landingPage, 'utf8');
  const showcase = readFileSync(mezcalShowcase, 'utf8');

  assert.match(page, /imageSrcSet=\{`\$\{mobileShowcaseAvifUrl\} \$\{MOBILE_SHOWCASE_BACKGROUND_AVIF_WIDTH\}w`\}/);
  assert.match(page, /imageSizes="100vw"[\s\S]*?media="\(max-width: 640px\)"[\s\S]*?fetchPriority="high"/);
  assert.match(showcase, /MOBILE_SHOWCASE_BACKGROUND_AVIF_PATH\s*=\s*'images\/mezcal-showcase-background-mobile-640\.avif'/);
  assert.match(showcase, /MOBILE_SHOWCASE_BACKGROUND_AVIF_WIDTH\s*=\s*640/);
  assert.match(showcase, /MOBILE_SHOWCASE_BACKGROUND_PATH\s*=\s*'images\/mezcal-showcase-background-mobile\.webp'/);
  assert.match(showcase, /MOBILE_SHOWCASE_BACKGROUND_FALLBACK_PATH\s*=\s*'images\/mezcal-showcase-background-mobile\.png'/);
  assert.match(showcase, /MOBILE_SHOWCASE_BACKGROUND_WIDTHS\s*=\s*\[320,\s*480,\s*640\]/);
  assert.ok(showcase.indexOf('type="image/avif"') < showcase.indexOf('type="image/webp"'));
  assert.match(showcase, /media="\(max-width: 640px\)"[\s\S]*?type="image\/webp"[\s\S]*?MOBILE_SHOWCASE_BACKGROUND_FALLBACK_PATH/);
});

test('showcase LCP image is prioritized and decoded synchronously', () => {
  const showcase = readFileSync(mezcalShowcase, 'utf8');
  const background = showcase.match(/<img[^>]*className="absolute inset-0 h-full w-full object-cover"[^>]*\/>/)?.[0];

  assert.ok(background, 'Expected the showcase background image to exist');
  assert.match(background, /fetchPriority="high"/);
  assert.match(background, /decoding="sync"/);
});

test('mobile showcase offers optimized 480 px and 640 px renditions for phone widths and DPR', () => {
  const showcase = readFileSync(mezcalShowcase, 'utf8');
  const generator = readFileSync(mediaGenerator, 'utf8');

  assert.match(showcase, /MOBILE_SHOWCASE_BACKGROUND_WIDTHS\s*=\s*\[320,\s*480,\s*640\]/);
  assert.match(generator, /generate_renditions 'mezcal-showcase-background-mobile\.png' 60 320 480/);
  assert.match(generator, /generate_renditions 'mezcal-showcase-background-mobile\.png' 35 640/);
});

test('mobile AVIF generation preserves 640 px framing within its transfer budget', () => {
  const generator = readFileSync(mobileAvifGenerator, 'utf8');

  assert.match(generator, /const outputWidth = 640/);
  assert.match(generator, /resize\(\{ width: outputWidth \}\)/);
  assert.match(generator, /avif\(\{ quality: 32, effort: 6 \}\)/);
  assert.match(generator, /25 \* 1024/);
});

test('R2 renditions stay out of Railway production image but remain available to local development', () => {
  const developmentIgnore = readFileSync(developmentDockerIgnore, 'utf8');
  const productionIgnore = readFileSync(productionDockerIgnore, 'utf8');

  assert.doesNotMatch(developmentIgnore, /^public\/images\/?$/m);
  assert.match(productionIgnore, /^public\/images\/?$/m);
  assert.match(productionIgnore, /^\.generated\/?$/m);
});

test('responsive image source sets are emitted only for external R2 media', () => {
  const component = readFileSync(responsiveMediaImage, 'utf8');

  assert.match(component, /mediaOrigin\(src\)/);
  assert.match(component, /mediaRenditionSrcSet\(src, widths, sourceWidth\)/);
});

test('landing gives non-LCP hero and header images low fetch priority', () => {
  const hero = readFileSync(landingHero, 'utf8');
  const header = readFileSync(siteHeader, 'utf8');
  const showcase = readFileSync(mezcalShowcase, 'utf8');

  assert.match(hero, /fetchPriority="low"/);
  assert.match(header, /loading="eager"/);
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

test('product-card photos remain lazy and use low fetch priority', () => {
  const showcase = readFileSync(mezcalShowcase, 'utf8');
  const card = showcase.match(/function MezcalCard\([\s\S]*?(?=export function MezcalShowcaseSection)/)?.[0];
  const images = card?.match(/<ResponsiveMediaImage\b[\s\S]*?\/>/g) ?? [];

  assert.equal(images.length, 2, 'Expected one product photo and one lifestyle photo per card');
  for (const image of images) {
    assert.match(image, /loading="lazy"/);
    assert.match(image, /fetchPriority="low"/);
  }
});
