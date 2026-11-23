import { Suspense } from 'react';
import { cacheLife, io } from 'next/cache';
import { mediaObjectUrl } from '../lib/media-url';
import SiteHeader from '../components/header/header';
import AgeGate from '../components/age-gate/age-gate';
import LandingHero from '../components/landing/landing-hero';
import MezcalShowcase, {
  MOBILE_SHOWCASE_BACKGROUND_PATH,
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
  return (
    <>
      <link
        rel="preload"
        as="image"
        href={mediaObjectUrl(mediaBaseUrl, MOBILE_SHOWCASE_BACKGROUND_PATH)}
        type="image/webp"
        media="(max-width: 640px)"
        fetchPriority="high"
      />
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
