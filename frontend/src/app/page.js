import { Suspense } from 'react';
import { cacheLife, io } from 'next/cache';
import { mediaObjectUrl, mediaOrigin, mediaRenditionSrcSet } from '../lib/media-url.js';
import SiteHeader from '../components/header/header';
import AgeGate from '../components/age-gate/age-gate';
import {
  AGE_GATE_EMBLEM_PATH,
  AGE_GATE_EMBLEM_FALLBACK_PATH,
  AGE_GATE_EMBLEM_SIZES,
  AGE_GATE_EMBLEM_SOURCE_WIDTH,
  AGE_GATE_EMBLEM_WIDTHS,
} from '../components/age-gate/age-gate-image.js';
import LandingHero from '../components/landing/landing-hero';
import MezcalShowcase, {
  MOBILE_SHOWCASE_BACKGROUND_PATH,
  MOBILE_SHOWCASE_BACKGROUND_FALLBACK_PATH,
  MOBILE_SHOWCASE_BACKGROUND_WIDTHS,
  MezcalShowcaseSection,
  MezcalShowcaseSkeleton,
} from '../components/landing/mezcal-showcase/mezcal-showcase';
import LandingWhatsAppCta from '../components/landing/landing-whatsapp-cta';
import LandingRitual from '../components/landing/landing-ritual';
import LandingFaq from '../components/landing/faq/landing-faq';
import LandingVisitorCounter from '../components/landing/landing-visitor-counter';
import LandingFooter from '../components/landing/landing-footer';

async function getCachedCatalog(apiUrl) {
  'use cache';
  if (!apiUrl) { cacheLife('seconds'); return null; }
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/catalog/products`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) { cacheLife('seconds'); return null; }
    const body = await response.json();
    if (!Array.isArray(body.products)) { cacheLife('seconds'); return null; }
    cacheLife('days');
    return body.products;
  } catch (error) {
    console.error('[catalog] failed to load', error instanceof Error ? error.name : 'UnknownError');
    cacheLife('seconds');
    return null;
  }
}

async function CatalogContent({ mediaBaseUrl }) {
  return <MezcalShowcase products={await getCachedCatalog(process.env.INTERNAL_API_URL)} mediaBaseUrl={mediaBaseUrl} />;
}

async function CurrentYear() {
  await io();
  return new Date().getFullYear();
}

export default function Home() {
  const mediaBaseUrl = process.env.MEDIA_BASE_URL || '';
  const hasRemoteMedia = Boolean(mediaOrigin(mediaBaseUrl));
  const ageGateEmblemUrl = mediaObjectUrl(mediaBaseUrl, AGE_GATE_EMBLEM_PATH);
  const ageGateEmblemFallbackUrl = mediaObjectUrl(mediaBaseUrl, AGE_GATE_EMBLEM_FALLBACK_PATH);
  const mobileShowcaseUrl = mediaObjectUrl(mediaBaseUrl, MOBILE_SHOWCASE_BACKGROUND_PATH);
  const mobileShowcaseFallbackUrl = mediaObjectUrl(mediaBaseUrl, MOBILE_SHOWCASE_BACKGROUND_FALLBACK_PATH);
  return (
    <>
      {hasRemoteMedia ? (
        <link
          rel="preload"
          as="image"
          href={ageGateEmblemUrl}
          imageSrcSet={mediaRenditionSrcSet(ageGateEmblemUrl, AGE_GATE_EMBLEM_WIDTHS, AGE_GATE_EMBLEM_SOURCE_WIDTH)}
          imageSizes={AGE_GATE_EMBLEM_SIZES}
          type="image/webp"
          fetchPriority="high"
        />
      ) : (
        <link
          rel="preload"
          as="image"
          href={ageGateEmblemFallbackUrl}
          type="image/png"
          fetchPriority="high"
        />
      )}
      {hasRemoteMedia ? (
        <link
          rel="preload"
          as="image"
          href={mobileShowcaseUrl}
          imageSrcSet={mediaRenditionSrcSet(mobileShowcaseUrl, MOBILE_SHOWCASE_BACKGROUND_WIDTHS)}
          imageSizes="100vw"
          type="image/webp"
          media="(max-width: 640px)"
          fetchPriority="high"
        />
      ) : (
        <link
          rel="preload"
          as="image"
          href={mobileShowcaseFallbackUrl}
          type="image/png"
          media="(max-width: 640px)"
          fetchPriority="high"
        />
      )}
      <AgeGate mediaBaseUrl={mediaBaseUrl}>
        <div className="bg-mictlan-background text-mictlan-ivory">
          <SiteHeader mediaBaseUrl={mediaBaseUrl} />
          <main>
            <LandingHero mediaBaseUrl={mediaBaseUrl} />
            <MezcalShowcaseSection mediaBaseUrl={mediaBaseUrl}>
              <Suspense fallback={<MezcalShowcaseSkeleton />}><CatalogContent mediaBaseUrl={mediaBaseUrl} /></Suspense>
            </MezcalShowcaseSection>
            <LandingWhatsAppCta />
            <LandingRitual />
            <LandingFaq mediaBaseUrl={mediaBaseUrl} />
            <LandingVisitorCounter />
          </main>
          <LandingFooter mediaBaseUrl={mediaBaseUrl} year={<Suspense fallback="…"><CurrentYear /></Suspense>} />
        </div>
      </AgeGate>
    </>
  );
}
